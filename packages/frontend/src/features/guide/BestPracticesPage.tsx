import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CodeBlock } from './components';

interface TipCardProps {
  title: string;
  tip: string;
  children: React.ReactNode;
}

function TipCard({ title, tip, children }: TipCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="text-primary font-medium">{tip}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

interface ComparisonTableProps {
  headers: [string, string];
  rows: [string, string][];
}

function ComparisonTable({ headers, rows }: ComparisonTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">{headers[0]}</th>
            <th className="text-left py-2 font-medium text-muted-foreground">{headers[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b last:border-0">
              <td className="py-2 pr-4 text-red-600 dark:text-red-400">{row[0]}</td>
              <td className="py-2 text-green-600 dark:text-green-400">{row[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BestPracticesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">最佳实践</h1>
        <p className="text-muted-foreground mt-2">
          从环境配置到并行会话扩展，充分发挥 Claude Code 潜力的技巧和模式
        </p>
      </div>

      <div className="rounded-lg border bg-amber-50 dark:bg-amber-950 p-4">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>核心约束：</strong>Claude 的上下文窗口会快速填满，性能会随之下降。当上下文窗口接近满载时，Claude 可能会开始"忘记"早期指令或产生更多错误。管理好上下文窗口是最重要的。
        </p>
      </div>

      <div className="space-y-6">
        <TipCard
          title="给 Claude 一种验证工作的方法"
          tip="包含测试、截图或预期输出，让 Claude 能够自我检查。这是最有效的单一方法。"
        >
          <p className="text-sm text-muted-foreground">
            当 Claude 能够验证自己的工作时（运行测试、对比截图、验证输出），效果会显著提升。没有明确的成功标准，它可能会产出看起来正确但实际不工作的内容。
          </p>
          <ComparisonTable
            headers={['之前', '之后']}
            rows={[
              [
                '实现一个验证邮箱地址的函数',
                '写一个 validateEmail 函数。测试用例：user@example.com 返回 true，invalid 返回 false，user@.com 返回 false。实现后运行测试',
              ],
              [
                '让仪表盘看起来更好',
                '[粘贴截图] 实现这个设计。截图对比结果，列出差异并修复',
              ],
              [
                '构建失败了',
                '构建失败并报错：[粘贴错误]。修复它并验证构建成功。解决根本原因，不要抑制错误',
              ],
            ]}
          />
        </TipCard>

        <TipCard
          title="先探索，再计划，最后编码"
          tip="将研究和规划与实现分开，避免解决错误的问题。"
        >
          <p className="text-sm text-muted-foreground mb-4">
            让 Claude 直接跳到编码可能会产出解决错误问题的代码。使用计划模式将探索与执行分开。
          </p>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">推荐工作流程分四个阶段：</p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li><strong>探索</strong>：进入计划模式，Claude 阅读文件并回答问题，不做更改</li>
                <li><strong>计划</strong>：请求 Claude 创建详细的实现计划</li>
                <li><strong>实现</strong>：切换回普通模式，让 Claude 编码并根据计划验证</li>
                <li><strong>提交</strong>：请求 Claude 用描述性消息提交并创建 PR</li>
              </ol>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">
                <strong>提示：</strong>计划模式很有用，但也增加开销。对于范围明确、修复较小的任务（如修复拼写错误、添加日志行或重命名变量），直接让 Claude 执行。当你不确定方法、更改涉及多个文件或你不熟悉要修改的代码时，规划最有用。
              </p>
            </div>
          </div>
        </TipCard>

        <TipCard
          title="在提示中提供具体上下文"
          tip="指令越精确，需要的纠正就越少。"
        >
          <p className="text-sm text-muted-foreground mb-4">
            Claude 可以推断意图，但无法读心。引用具体文件，提及约束，并指向示例模式。
          </p>
          <ComparisonTable
            headers={['之前', '之后']}
            rows={[
              [
                '为 foo.py 添加测试',
                '为 foo.py 编写测试，覆盖用户登出的边缘情况。避免使用 mock',
              ],
              [
                '为什么 ExecutionFactory 的 API 这么奇怪？',
                '查看 ExecutionFactory 的 git 历史，总结它的 API 是如何形成的',
              ],
              [
                '添加一个日历小部件',
                '看看首页现有小部件的实现方式来理解模式。HotDogWidget.php 是个好例子。按照这个模式实现一个新的日历小部件',
              ],
              [
                '修复登录 bug',
                '用户反映会话超时后登录失败。检查 src/auth/ 中的认证流程，特别是 token 刷新。写一个重现问题的失败测试，然后修复它',
              ],
            ]}
          />
        </TipCard>

        <TipCard
          title="提供丰富的内容"
          tip="使用 @ 引用文件，粘贴截图/图片，或直接管道传输数据。"
        >
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li><strong>用 @ 引用文件</strong>，而不是描述代码位置。Claude 在响应前会读取文件</li>
            <li><strong>直接粘贴图片</strong>。复制/粘贴或拖放图片到提示中</li>
            <li><strong>提供 URL</strong> 用于文档和 API 参考。使用 /permissions 允许常用域名</li>
            <li><strong>管道传输数据</strong>，运行 cat error.log | claude 直接发送文件内容</li>
            <li><strong>让 Claude 自己获取</strong>。告诉 Claude 使用 Bash 命令、MCP 工具或读取文件来获取上下文</li>
          </ul>
        </TipCard>

        <TipCard
          title="编写有效的 CLAUDE.md"
          tip="运行 /init 生成基于当前项目结构的初始 CLAUDE.md 文件，然后逐步完善。"
        >
          <p className="text-sm text-muted-foreground mb-4">
            CLAUDE.md 是一个特殊文件，Claude 在每次对话开始时都会读取。包含 Bash 命令、代码风格和工作流规则。这为 Claude 提供了它无法从代码中推断的持久上下文。
          </p>
          <CodeBlock
            title="CLAUDE.md"
            code={`# 代码风格
- 使用 ES 模块 (import/export) 语法，不使用 CommonJS (require)
- 尽可能解构导入 (如 import { foo } from 'bar')

# 工作流程
- 完成一系列代码更改后务必进行类型检查
- 优先运行单个测试而非整个测试套件，以提高性能`}
          />
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">✅ 应该包含</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Claude 无法猜测的 Bash 命令</li>
                <li>与默认不同的代码风格规则</li>
                <li>测试指令和首选测试运行器</li>
                <li>仓库规范（分支命名、PR 约定）</li>
                <li>项目特定的架构决策</li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">❌ 不应包含</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Claude 可以通过阅读代码弄清楚的内容</li>
                <li>Claude 已知的标准语言约定</li>
                <li>详细的 API 文档（改为链接到文档）</li>
                <li>经常变化的信息</li>
                <li>逐文件的代码库描述</li>
              </ul>
            </div>
          </div>
        </TipCard>

        <TipCard
          title="使用 CLI 工具"
          tip="告诉 Claude Code 使用 gh、aws、gcloud 和 sentry-cli 等 CLI 工具与外部服务交互。"
        >
          <p className="text-sm text-muted-foreground">
            CLI 工具是与外部服务交互最节省上下文的方式。如果你使用 GitHub，安装 gh CLI。Claude 知道如何使用它来创建问题、打开 PR 和阅读评论。没有 gh，Claude 仍然可以使用 GitHub API，但未认证的请求通常会遇到速率限制。Claude 也擅长学习它不认识的 CLI 工具。尝试这样的提示："使用 'foo-cli-tool --help' 了解 foo 工具，然后用它解决 A、B、C。"
          </p>
        </TipCard>

        <TipCard
          title="及早并经常纠正"
          tip="一旦发现 Claude 偏离轨道，立即纠正。"
        >
          <p className="text-sm text-muted-foreground mb-4">
            最好的结果来自紧密的反馈循环。虽然 Claude 偶尔能第一次就完美解决问题，但快速纠正通常能更快产出更好的解决方案。
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li><strong>Esc</strong>：用 Esc 键中途停止 Claude。上下文保留，可以重新引导</li>
            <li><strong>Esc + Esc 或 /rewind</strong>：按两次 Esc 或运行 /rewind 打开回退菜单，恢复之前的对话和代码状态</li>
            <li><strong>"撤销那个"</strong>：让 Claude 撤销它的更改</li>
            <li><strong>/clear</strong>：在不相关的任务之间重置上下文</li>
          </ul>
          <div className="mt-4 rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              如果你在同一个会话中对同一问题纠正了两次以上，上下文中已经充满了失败的尝试。运行 /clear 并用更具体的提示重新开始。带有更好提示的干净会话几乎总是优于累积纠正的长会话。
            </p>
          </div>
        </TipCard>

        <TipCard
          title="积极管理上下文"
          tip="在不相关的任务之间运行 /clear 重置上下文。"
        >
          <p className="text-sm text-muted-foreground mb-4">
            当你接近上下文限制时，Claude Code 会自动压缩对话历史，保留重要的代码和决策同时释放空间。
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>在任务之间频繁使用 /clear 完全重置上下文窗口</li>
            <li>当自动压缩触发时，Claude 会总结最重要的内容，包括代码模式、文件状态和关键决策</li>
            <li>如需更多控制，运行 /compact &lt;指令&gt;，如 /compact 专注于 API 更改</li>
            <li>在 CLAUDE.md 中自定义压缩行为，如"压缩时，始终保留修改文件的完整列表和任何测试命令"</li>
          </ul>
        </TipCard>

        <TipCard
          title="使用子代理进行调查"
          tip="用 '使用子代理调查 X' 委派研究。它们在单独的上下文中探索，保持主对话干净以便实现。"
        >
          <p className="text-sm text-muted-foreground mb-4">
            由于上下文是你的基本约束，子代理是可用的最强大工具之一。当 Claude 研究代码库时会读取大量文件，这些都消耗你的上下文。子代理在单独的上下文窗口中运行并返回摘要。
          </p>
          <CodeBlock
            code="使用子代理调查我们的认证系统如何处理 token 刷新，以及我们是否有任何应该重用的现有 OAuth 工具。"
          />
          <p className="text-sm text-muted-foreground mt-4">
            子代理探索代码库，读取相关文件，并报告发现，所有这些都不会弄乱你的主对话。你也可以在 Claude 实现后使用子代理进行验证：
          </p>
          <CodeBlock code="使用子代理审查这段代码的边缘情况" />
        </TipCard>

        <TipCard
          title="恢复对话"
          tip="运行 claude --continue 继续上次的工作，或 --resume 从最近的会话中选择。"
        >
          <p className="text-sm text-muted-foreground mb-4">
            Claude Code 在本地保存对话。当任务跨越多个会话时（开始一个功能，被打断，第二天回来），你不需要重新解释上下文。
          </p>
          <CodeBlock
            code={`claude --continue    # 恢复最近的对话
claude --resume      # 从最近的对话中选择`}
          />
          <p className="text-sm text-muted-foreground mt-4">
            使用 /rename 给会话起描述性名称（如 "oauth-migration"、"debugging-memory-leak"），以便以后找到它们。把会话当作分支对待。不同的工作流可以有单独的持久上下文。
          </p>
        </TipCard>

        <TipCard
          title="运行无头模式"
          tip="在 CI、pre-commit 钩子或脚本中使用 claude -p '提示'。添加 --output-format stream-json 获取流式 JSON 输出。"
        >
          <p className="text-sm text-muted-foreground mb-4">
            使用 claude -p "你的提示"，你可以无头运行 Claude，无需交互式会话。无头模式是将 Claude 集成到 CI 管道、pre-commit 钩子或任何自动化工作流的方式。
          </p>
          <CodeBlock
            code={`# 一次性查询
claude -p "解释这个项目做什么"

# 脚本的结构化输出
claude -p "列出所有 API 端点" --output-format json

# 实时处理的流式输出
claude -p "分析这个日志文件" --output-format stream-json`}
          />
        </TipCard>

        <TipCard
          title="运行多个 Claude 会话"
          tip="并行运行多个 Claude 会话来加速开发、运行隔离实验或启动复杂工作流。"
        >
          <p className="text-sm text-muted-foreground mb-4">
            除了并行化工作，多个会话还可以实现以质量为中心的工作流。新的上下文可以改善代码审查，因为 Claude 不会对它刚写的代码产生偏见。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium">会话 A（编写者）</th>
                  <th className="text-left py-2 font-medium">会话 B（审查者）</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 pr-4">为我们的 API 端点实现限流器</td>
                  <td className="py-2"></td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4"></td>
                  <td className="py-2">审查 @src/middleware/rateLimiter.ts 中的限流器实现。寻找边缘情况、竞态条件以及与现有中间件模式的一致性</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">这是审查反馈：[会话 B 输出]。解决这些问题</td>
                  <td className="py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </TipCard>

        <TipCard
          title="避免常见失败模式"
          tip="识别这些常见错误可以节省时间。"
        >
          <ul className="space-y-4 text-sm">
            <li>
              <p className="font-medium text-red-600 dark:text-red-400">厨房水槽会话</p>
              <p className="text-muted-foreground">
                你从一个任务开始，然后问 Claude 不相关的事情，然后又回到第一个任务。上下文充满了无关信息。
              </p>
              <p className="text-green-600 dark:text-green-400">修复：在不相关任务之间使用 /clear</p>
            </li>
            <li>
              <p className="font-medium text-red-600 dark:text-red-400">反复纠正</p>
              <p className="text-muted-foreground">
                Claude 做错了，你纠正它，还是错的，你再次纠正。上下文被失败的尝试污染了。
              </p>
              <p className="text-green-600 dark:text-green-400">修复：两次失败纠正后，/clear 并写一个更好的初始提示</p>
            </li>
            <li>
              <p className="font-medium text-red-600 dark:text-red-400">过度指定的 CLAUDE.md</p>
              <p className="text-muted-foreground">
                如果你的 CLAUDE.md 太长，Claude 会忽略一半，因为重要规则会在噪音中丢失。
              </p>
              <p className="text-green-600 dark:text-green-400">修复：无情地精简。如果 Claude 在没有指令的情况下已经正确执行，删除它或转换为钩子</p>
            </li>
            <li>
              <p className="font-medium text-red-600 dark:text-red-400">信任后再验证的差距</p>
              <p className="text-muted-foreground">
                Claude 产出了看起来合理但不处理边缘情况的实现。
              </p>
              <p className="text-green-600 dark:text-green-400">修复：始终提供验证（测试、脚本、截图）。如果无法验证，就不要发布</p>
            </li>
            <li>
              <p className="font-medium text-red-600 dark:text-red-400">无限探索</p>
              <p className="text-muted-foreground">
                你让 Claude "调查"某事而没有限定范围。Claude 读取数百个文件，填满了上下文。
              </p>
              <p className="text-green-600 dark:text-green-400">修复：严格限制调查范围或使用子代理，这样探索不会消耗你的主上下文</p>
            </li>
          </ul>
        </TipCard>

        <TipCard
          title="培养你的直觉"
          tip="本指南中的模式不是一成不变的。它们是一般有效的起点，但可能不是每种情况的最优选择。"
        >
          <p className="text-sm text-muted-foreground">
            注意什么有效。当 Claude 产出出色的输出时，注意你做了什么：提示结构、提供的上下文、所处的模式。当 Claude 遇到困难时，问问为什么。上下文太嘈杂？提示太模糊？任务对单次通过来说太大？
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            随着时间推移，你会培养出任何指南都无法捕捉的直觉。你会知道什么时候应该具体，什么时候应该开放；什么时候应该计划，什么时候应该探索；什么时候应该清除上下文，什么时候应该让它积累。
          </p>
        </TipCard>
      </div>
    </div>
  );
}
