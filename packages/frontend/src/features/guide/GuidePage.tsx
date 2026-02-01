import { useState } from 'react';
import { Terminal, Info } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock, StepCard, ApiKeySelector } from './components';

export function GuidePage() {
  const [apiKey, setApiKey] = useState<string>('');
  const baseUrl = `${window.location.origin}/proxy`;

  const envVarPlaceholder = apiKey || 'YOUR_API_KEY';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">使用指南</h1>
        <p className="text-muted-foreground mt-2">
          按照以下步骤安装和配置 Claude Code，开始使用 AI 辅助编程
        </p>
      </div>

      <Tabs defaultValue="macos" className="w-full">
        <TabsList>
          <TabsTrigger value="macos">macOS / Linux</TabsTrigger>
          <TabsTrigger value="windows">Windows</TabsTrigger>
        </TabsList>

        <TabsContent value="macos" className="mt-6">
          <div className="space-y-2">
            <StepCard
              stepNumber={1}
              title="安装 Claude Code"
              description="使用官方安装脚本一键安装"
            >
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">方法一：原生安装（推荐）</p>
                  <CodeBlock code="curl -fsSL https://claude.ai/install.sh | bash" />
                  <div className="flex items-start gap-2 mt-2 rounded-lg bg-blue-50 dark:bg-blue-950 p-3">
                    <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      原生安装会自动后台更新，确保你始终使用最新版本
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">方法二：使用 Homebrew</p>
                  <CodeBlock code="brew install --cask claude-code" />
                  <p className="text-sm text-muted-foreground mt-2">
                    Homebrew 安装不会自动更新，需要定期运行 <code className="rounded bg-muted px-1 py-0.5">brew upgrade claude-code</code> 获取最新版本
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">方法三：使用 npm</p>
                  <CodeBlock code="npm install -g @anthropic-ai/claude-code" />
                  <p className="text-sm text-muted-foreground mt-2">
                    需要 Node.js 18 或更高版本
                  </p>
                </div>
              </div>
            </StepCard>

            <StepCard
              stepNumber={2}
              title="设置环境变量"
              description="配置 API 端点和密钥"
            >
              <div className="space-y-4">
                <ApiKeySelector onKeyChange={setApiKey} />

                <div>
                  <p className="text-sm font-medium mb-2">临时设置（当前终端会话有效）</p>
                  <CodeBlock
                    code={`export ANTHROPIC_BASE_URL="${baseUrl}"
export ANTHROPIC_API_KEY="${envVarPlaceholder}"`}
                  />
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">永久设置（添加到 ~/.zshrc 或 ~/.bashrc）</p>
                  <CodeBlock
                    code={`echo 'export ANTHROPIC_BASE_URL="${baseUrl}"' >> ~/.zshrc
echo 'export ANTHROPIC_API_KEY="${envVarPlaceholder}"' >> ~/.zshrc
source ~/.zshrc`}
                  />
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">VSCode 插件配置</p>
                  <p className="text-sm text-muted-foreground mb-2">
                    在 VSCode 设置 (settings.json) 中添加：
                  </p>
                  <CodeBlock
                    title="settings.json"
                    code={`{
  "claude-code.apiBaseUrl": "${baseUrl}",
  "claude-code.apiKey": "${envVarPlaceholder}"
}`}
                  />
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">验证配置</p>
                  <CodeBlock
                    code={`echo $ANTHROPIC_BASE_URL
echo $ANTHROPIC_API_KEY`}
                  />
                </div>
              </div>
            </StepCard>

            <StepCard
              stepNumber={3}
              title="开始使用"
              description="启动 Claude Code"
              isLast
            >
              <div className="space-y-4">
                <CodeBlock code={`cd your-project
claude`} />
                <div className="flex items-center gap-2 rounded-lg bg-muted p-4">
                  <Terminal className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    进入项目目录后运行 <code className="rounded bg-background px-1 py-0.5">claude</code> 命令，即可开始与 Claude 进行对话
                  </p>
                </div>
              </div>
            </StepCard>
          </div>
        </TabsContent>

        <TabsContent value="windows" className="mt-6">
          <div className="space-y-2">
            <StepCard
              stepNumber={1}
              title="安装 Claude Code"
              description="使用官方安装脚本一键安装"
            >
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">方法一：PowerShell 安装（推荐）</p>
                  <CodeBlock code="irm https://claude.ai/install.ps1 | iex" />
                  <div className="flex items-start gap-2 mt-2 rounded-lg bg-blue-50 dark:bg-blue-950 p-3">
                    <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      原生安装会自动后台更新，确保你始终使用最新版本
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">方法二：CMD 安装</p>
                  <CodeBlock code="curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd" />
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">方法三：使用 WinGet</p>
                  <CodeBlock code="winget install Anthropic.ClaudeCode" />
                  <p className="text-sm text-muted-foreground mt-2">
                    WinGet 安装不会自动更新，需要定期运行 <code className="rounded bg-muted px-1 py-0.5">winget upgrade Anthropic.ClaudeCode</code> 获取最新版本
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">方法四：使用 npm</p>
                  <CodeBlock code="npm install -g @anthropic-ai/claude-code" />
                  <p className="text-sm text-muted-foreground mt-2">
                    需要 Node.js 18 或更高版本
                  </p>
                </div>
              </div>
            </StepCard>

            <StepCard
              stepNumber={2}
              title="设置环境变量"
              description="配置 API 端点和密钥"
            >
              <div className="space-y-4">
                <ApiKeySelector onKeyChange={setApiKey} />

                <div>
                  <p className="text-sm font-medium mb-2">临时设置（PowerShell 当前会话）</p>
                  <CodeBlock
                    code={`$env:ANTHROPIC_BASE_URL = "${baseUrl}"
$env:ANTHROPIC_API_KEY = "${envVarPlaceholder}"`}
                  />
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">永久设置（系统环境变量）</p>
                  <CodeBlock
                    code={`[Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", "${baseUrl}", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "${envVarPlaceholder}", "User")`}
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    设置后需要重新打开 PowerShell 或终端才能生效
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">VSCode 插件配置</p>
                  <p className="text-sm text-muted-foreground mb-2">
                    在 VSCode 设置 (settings.json) 中添加：
                  </p>
                  <CodeBlock
                    title="settings.json"
                    code={`{
  "claude-code.apiBaseUrl": "${baseUrl}",
  "claude-code.apiKey": "${envVarPlaceholder}"
}`}
                  />
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">验证配置</p>
                  <CodeBlock
                    code={`$env:ANTHROPIC_BASE_URL
$env:ANTHROPIC_API_KEY`}
                  />
                </div>
              </div>
            </StepCard>

            <StepCard
              stepNumber={3}
              title="开始使用"
              description="启动 Claude Code"
              isLast
            >
              <div className="space-y-4">
                <CodeBlock code={`cd your-project
claude`} />
                <div className="flex items-center gap-2 rounded-lg bg-muted p-4">
                  <Terminal className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    进入项目目录后运行 <code className="rounded bg-background px-1 py-0.5">claude</code> 命令，即可开始与 Claude 进行对话
                  </p>
                </div>
              </div>
            </StepCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
