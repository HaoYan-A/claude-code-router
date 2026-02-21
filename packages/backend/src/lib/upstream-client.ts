/**
 * TLS 指纹化上游 HTTP 客户端
 *
 * 核心能力：
 * 1. Chrome 131 TLS 指纹 (JA3/JA4) — 通过 node-tls-client
 * 2. HTTP/2 SETTINGS 指纹 (Akamai fingerprint)
 * 3. 连接池管理
 * 4. 代理支持 (复用 THIRD_PARTY_PROXY 配置)
 * 5. 流式响应支持 (自动降级到原生 fetch)
 *
 * 设计决策：
 * - node-tls-client 的 Response.body 是 string (非流)，无法用于 SSE 流式响应
 * - 因此采用混合方案：
 *   - 非流式请求：使用 node-tls-client Session (完整 TLS 指纹保护)
 *   - 流式请求：使用原生 fetch + 完整 Header 伪装 (Header 级保护)
 */

import { Session, ClientIdentifier } from 'node-tls-client';
import type { SessionOptions, PostRequestOptions, GetRequestOptions } from 'node-tls-client';
import { ProxyAgent } from 'undici';
import { logger } from './logger.js';

export interface UpstreamClientOptions {
  /** 代理 URL (http://user:pass@host:port) */
  proxyUrl?: string;
  /** TLS 指纹配置文件 (默认 chrome_131) */
  tlsProfile?: string;
  /** 是否启用 TLS 指纹 (默认 true) */
  tlsEnabled?: boolean;
  /** 请求超时 (ms, 默认 120000) */
  timeout?: number;
  /** 自定义 User-Agent */
  customUserAgent?: string;
}

export interface UpstreamFetchOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
  /** 是否为流式请求 (需要 ReadableStream 响应) */
  stream?: boolean;
}

/**
 * TLS 指纹化的上游 HTTP 客户端
 */
export class UpstreamClient {
  private session: Session | null = null;
  private proxyAgent: ProxyAgent | undefined;
  private readonly proxyUrl: string | undefined;
  private readonly tlsEnabled: boolean;
  private readonly tlsProfile: string;
  private readonly timeout: number;

  constructor(options: UpstreamClientOptions = {}) {
    this.proxyUrl = options.proxyUrl;
    this.tlsEnabled = options.tlsEnabled !== false;
    this.tlsProfile = options.tlsProfile || 'chrome_131';
    this.timeout = options.timeout || 120_000;

    // 初始化 undici ProxyAgent (用于流式请求的原生 fetch)
    if (this.proxyUrl) {
      this.proxyAgent = new ProxyAgent(this.proxyUrl);
    }

    // 初始化 TLS Session
    if (this.tlsEnabled) {
      this.initTlsSession();
    }
  }

  /**
   * 初始化 TLS Session (带 Chrome 131 指纹)
   */
  private initTlsSession(): void {
    try {
      const clientId = this.resolveClientIdentifier();

      const sessionOptions: SessionOptions = {
        clientIdentifier: clientId,
        timeout: this.timeout,
        // HTTP/2 SETTINGS (模拟 Chrome)
        h2Settings: {
          HEADER_TABLE_SIZE: 65536,
          INITIAL_WINDOW_SIZE: 6291456,
          MAX_FRAME_SIZE: 16384,
          MAX_CONCURRENT_STREAMS: 1000,
          MAX_HEADER_LIST_SIZE: 262144,
          ENABLE_PUSH: false,
        },
        h2SettingsOrder: [
          'HEADER_TABLE_SIZE',
          'ENABLE_PUSH',
          'MAX_CONCURRENT_STREAMS',
          'INITIAL_WINDOW_SIZE',
          'MAX_FRAME_SIZE',
          'MAX_HEADER_LIST_SIZE',
        ],
        // 伪头顺序 (Chrome 标准)
        pseudoHeaderOrder: [':method', ':authority', ':scheme', ':path'],
        // 连接流控窗口
        connectionFlow: 15663105,
        // 连接池
        transportOptions: {
          disableKeepAlives: false,
          disableCompression: false,
          maxIdleConns: 100,
          maxIdleConnsPerHost: 16,
          maxConnsPerHost: 0,
          maxResponseHeaderBytes: 0,
          writeBufferSize: 0,
          readBufferSize: 0,
          idleConnTimeout: 90_000_000_000, // 90s in nanoseconds
        },
      };

      // 代理配置
      if (this.proxyUrl) {
        sessionOptions.proxy = this.proxyUrl;
      }

      this.session = new Session(sessionOptions);
      logger.info(
        { tlsProfile: this.tlsProfile, proxy: !!this.proxyUrl },
        'TLS session initialized with Chrome fingerprint'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to initialize TLS session, falling back to native fetch');
      this.session = null;
    }
  }

  /**
   * 解析 ClientIdentifier 枚举
   */
  private resolveClientIdentifier(): ClientIdentifier {
    const profileMap: Record<string, ClientIdentifier> = {
      chrome_120: ClientIdentifier.chrome_120,
      chrome_124: ClientIdentifier.chrome_124,
      chrome_131: ClientIdentifier.chrome_131,
      chrome_131_psk: ClientIdentifier.chrome_131_psk,
      firefox_132: ClientIdentifier.firefox_132,
      firefox_133: ClientIdentifier.firefox_133,
      safari_ios_18_0: ClientIdentifier.safari_ios_18_0,
    };

    return profileMap[this.tlsProfile] || ClientIdentifier.chrome_131;
  }

  /**
   * 发起 HTTP 请求 (自动选择 TLS 客户端或原生 fetch)
   *
   * - stream=false (默认): 使用 TLS Session (完整指纹保护)
   * - stream=true: 使用原生 fetch (Header 级保护 + 流式支持)
   */
  async fetch(url: string, options: UpstreamFetchOptions): Promise<UpstreamResponse> {
    if (options.stream) {
      return this.fetchWithNative(url, options);
    }

    if (this.session && this.tlsEnabled) {
      return this.fetchWithTls(url, options);
    }

    return this.fetchWithNative(url, options);
  }

  /**
   * 使用 TLS Session 发起请求 (完整指纹保护，非流式)
   */
  private async fetchWithTls(url: string, options: UpstreamFetchOptions): Promise<UpstreamResponse> {
    if (!this.session) {
      return this.fetchWithNative(url, options);
    }

    try {
      const requestOptions: PostRequestOptions & GetRequestOptions = {
        headers: options.headers,
        body: options.body,
        followRedirects: true,
      };

      let response;
      const method = options.method.toUpperCase();

      switch (method) {
        case 'POST':
          response = await this.session.post(url, requestOptions);
          break;
        case 'GET':
          response = await this.session.get(url, requestOptions);
          break;
        case 'PUT':
          response = await this.session.put(url, requestOptions);
          break;
        case 'PATCH':
          response = await this.session.patch(url, requestOptions);
          break;
        case 'DELETE':
          response = await this.session.delete(url, requestOptions);
          break;
        default:
          response = await this.session.post(url, requestOptions);
      }

      // 转换响应头格式 (IncomingHttpHeaders → Record<string, string>)
      const headers: Record<string, string> = {};
      if (response.headers) {
        for (const [key, value] of Object.entries(response.headers)) {
          if (value !== undefined) {
            headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
          }
        }
      }

      return {
        ok: response.ok,
        status: response.status,
        headers,
        body: null,
        bodyText: response.body,
        usedTls: true,
        async text() {
          return response.body;
        },
        async json() {
          return JSON.parse(response.body);
        },
      };
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), url },
        'TLS fetch failed, falling back to native fetch'
      );
      return this.fetchWithNative(url, options);
    }
  }

  /**
   * 使用原生 fetch 发起请求 (Header 级保护，支持流式)
   */
  private async fetchWithNative(url: string, options: UpstreamFetchOptions): Promise<UpstreamResponse> {
    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      method: options.method,
      headers: options.headers,
      body: options.body,
    };

    if (this.proxyAgent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchOptions.dispatcher = this.proxyAgent as any;
    }

    const response = await fetch(url, fetchOptions);

    // 收集响应头
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      ok: response.ok,
      status: response.status,
      headers,
      body: response.body,
      bodyText: null,
      usedTls: false,
      async text() {
        return response.text();
      },
      async json() {
        return response.json();
      },
    };
  }

  /**
   * 销毁客户端，释放资源
   */
  async destroy(): Promise<void> {
    if (this.session) {
      try {
        await this.session.close();
      } catch (error) {
        logger.warn({ error }, 'Error closing TLS session');
      }
      this.session = null;
    }
  }
}

/**
 * 统一的上游响应接口
 */
export interface UpstreamResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  /** 原生 fetch 的 ReadableStream body (流式请求时可用) */
  body: ReadableStream<Uint8Array> | null;
  /** TLS 客户端的 string body (非流式请求时可用) */
  bodyText: string | null;
  /** 是否使用了 TLS 指纹 */
  usedTls: boolean;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

// 单例实例
let _instance: UpstreamClient | undefined;

/**
 * 获取全局 UpstreamClient 单例
 */
export function getUpstreamClient(options?: UpstreamClientOptions): UpstreamClient {
  if (!_instance) {
    _instance = new UpstreamClient(options);
  }
  return _instance;
}

/**
 * 初始化全局 UpstreamClient (应在服务启动时调用)
 */
export function initUpstreamClient(options: UpstreamClientOptions): UpstreamClient {
  if (_instance) {
    _instance.destroy().catch(() => {});
  }
  _instance = new UpstreamClient(options);
  return _instance;
}
