# Storefront Risk Shield V2

本文描述一种适用于托管式电商或内容站的轻量级爬虫风险防御系统。它通过早期加载的浏览器脚本、边缘 Worker、行为聚合、托管式人机验证和轻量数据库，识别规模化自动化访问，并把低可信流量导向安全的公开内容区域。

本文只使用通用占位符，不包含任何真实品牌、域名、行业、客户、IP、CIDR、ASN、服务商名单、账号标识、数据库标识、密钥或生产访问数据。

## 1. 目标与威胁模型

目标不是让公开网站变成无法读取，而是提高以下行为的成本：

- 使用大量住宅代理、云服务器或 VPN 轮换出口的批量抓取。
- 模拟普通浏览器，不断更换 IP、ISP、国家和 User-Agent 的自动化访问。
- 使用无头浏览器枚举商品、分类、知识库或其他高价值页面。
- 通过返回、刷新或重复打开页面绕过一次性跳转。
- 伪装成搜索引擎或 AI crawler 的 User-Agent 欺骗。
- 通过打码平台复用一次验证结果，并把凭证分发到代理池。

业务目标：

- 真实买家尽量无感访问。
- 高可信搜索和 AI crawler 保持可发现性。
- 中风险访问先做人机验证。
- 高风险自动化流量跳到公开、安全、低敏感度的内容区。
- 每个决定都留下可审计证据，规则只根据数据调整。

## 2. 必须接受的技术边界

如果主站没有经过你控制的反向代理或边缘 WAF，而是由托管平台直接返回 HTML，那么浏览器端 shield.js 无法做到第一字节阻断。

这意味着：

- 它能有效限制会执行 JavaScript 的自动化浏览器。
- 它能阻止大规模浏览器渲染、点击、翻页和内容枚举。
- 它不能阻止纯 HTTP 客户端先拿到公开 HTML 源码。
- 它不能保护真正的商业机密、客户数据或内部价格。
- 绝不能因为部署了该系统，就把敏感信息放进公开 HTML。

如果必须阻止原始 HTML 被获取，需要使用受控反向代理、边缘 WAF、认证接口或 Headless storefront。这与本文的轻量方案属于不同架构。

## 3. 总体架构

~~~mermaid
flowchart TD
    A["访客打开店铺页面"] --> B["页面 head 早期加载 shield.js"]
    B --> C["边缘 Worker 检查请求元数据"]
    C --> D{"可信 crawler 来源验证"}
    D -->|"通过"| E["Allow：继续加载"]
    D -->|"未通过"| F["静态风险规则"]
    F --> G{"立即高风险？"}
    G -->|"是"| H["Redirect：安全内容区"]
    G -->|"否"| I["浏览器提交页面与行为信号"]
    I --> J["Worker 生成 campaign_key 与 cohort_key"]
    J --> K["数据库聚合路径、IP、ASN、国家、交互和停留"]
    K --> L{"联合风险决策"}
    L -->|"Allow"| M["正常浏览并持续记录"]
    L -->|"Challenge"| N["Turnstile 二次验证"]
    L -->|"Redirect"| H
    N -->|"成功"| O["短效验证会话"]
    N -->|"失败、超时或加载失败"| H
    O --> P{"验证后异常换网？"}
    P -->|"否"| M
    P -->|"是"| Q["撤销验证会话"]
    Q --> H
~~~

## 4. 组件职责

### 4.1 店铺主题中的早期脚本

在普通店铺页面的 head 前部同步加载：

~~~html
<script src="https://<SHIELD_ORIGIN>/shield.js"></script>
~~~

不要默认加入 async 或 defer。同步早期加载的目的，是在重型主题脚本、商品组件和第三方 App 运行前完成初步判断。

安全内容落地点、购物车、结账、后台和其他明确豁免页面不加载或不执行防御逻辑，避免跳转循环。

### 4.2 边缘 Worker

Worker 负责：

- 返回动态 shield.js。
- 读取边缘网络提供的 IP、国家、地区、城市、ASN、组织、机房和 TLS 元数据。
- 读取 User-Agent、Client Hints、Accept-Language 和 Referrer。
- 调用可选的 VPN、Proxy、Hosting、Tor 情报接口。
- 校验请求来源和 CORS。
- 生成 HMAC 化的行为关联键。
- 查询最近行为并作出 allow、challenge 或 redirect 决定。
- 在服务端校验 Turnstile Token。
- 记录事件并提供受保护的查询、导出接口。

### 4.3 轻量数据库

数据库负责保存：

- 访问事件。
- 动态蜜罐命中。
- 短效验证会话。
- 行为聚合所需的时间索引。

数据库不应保存 Turnstile 私钥、HMAC 私钥、API Token 或原始 cohort seed。

### 4.4 托管式人机验证

Turnstile 或同类服务只在风险达到阈值时出现，而不是让所有访客先做验证。验证成功后，Worker 创建短效会话。该会话不能永久放行，也不能脱离浏览器签名独立使用。

## 5. 路径模型

### 5.1 受保护路径

示例：

~~~text
/products
/collections
/pages
/knowledge
/account
/search
~~~

实际项目应按业务调整。受保护路径是行为评分和挑战的主要范围，不代表这些页面从搜索引擎消失。

### 5.2 豁免路径

示例：

~~~text
/safe-content
/access-denied
/cart
/checkout
/admin
~~~

安全内容落地点必须豁免，否则会形成无限跳转。

### 5.3 多语言路径

路径匹配前同时保留原始路径和去除 locale 后的路径：

~~~text
/fr/products/example  -> /products/example
/pt-pt/pages/example  -> /pages/example
~~~

通用 locale 前缀规则：

~~~regex
^/[a-z]{2}(?:-[a-z]{2})?(?=/)
~~~

这样不需要为每个语言市场重复配置受保护路径。

## 6. 决策顺序

规则顺序非常重要：

~~~text
1. 路径豁免
2. 已验证可信 crawler
3. 明确高风险静态规则
4. 精确已确认自动化指纹
5. 自动化浏览器信号
6. cohort 行为聚合
7. campaign / visitor 行为聚合
8. 蜜罐辅助信号
9. 默认允许并记录
~~~

不要让一个普通 ISP、单一国家、单次快速访问或单个 User-Agent 成为唯一封锁理由。

## 7. 搜索引擎与 AI crawler 放行

### 7.1 User-Agent 不是身份证

任何客户端都能声明自己是 Googlebot、GPTBot 或其他 crawler。生产系统不应只凭 User-Agent 放行高价值路径。

推荐的验证方法：

- 使用官方公开 IP 范围。
- 校验 ASN 和组织归属。
- 对支持的 crawler 做正向与反向 DNS 验证。
- 缓存验证结果，避免每次请求都做 DNS 查询。
- 把名称匹配和来源验证记录成两个独立证据。

### 7.2 建议分类

~~~text
必须验证后放行：主要搜索引擎抓取、站点检查工具
根据业务选择放行：AI 搜索、社交预览、SEO 分析工具
默认观察：新出现但行为正常的 crawler
限制或跳转：明确高频抓取、伪装来源、已证实恶意 campaign
~~~

### 7.3 白名单必须可审计

每个白名单规则至少记录：

~~~text
rule_id
expected_user_agent
expected_network_source
verification_method
last_verified_at
decision
~~~

## 8. 静态风险层

静态规则适合处理已经有证据的来源：

- 明确恶意 crawler 名称。
- 已确认的完整 User-Agent 指纹。
- 已确认的精确 IP 或 CIDR。
- 已确认的 ASN。
- 已确认的云服务商、代理商或托管网络。
- IP 情报判定的 VPN、Proxy、Hosting 或 Tor。

建议评分起点：

| 信号 | 建议分数 | 默认动作 |
|---|---:|---|
| 已验证可信 crawler | 0 | Allow |
| 已确认恶意 crawler | 90 | Redirect |
| 已确认精确 campaign 指纹 | 90 | 仅受保护路径 Redirect |
| 已确认风险 ASN/CIDR | 85-95 | Redirect |
| VPN/Proxy | 70-90 | 根据业务选择 Challenge 或 Redirect |
| Hosting/Datacenter | 60-80 | 先记录或 Challenge |
| Tor | 90-95 | Challenge 或 Redirect |
| 国家策略 | 80 | 谨慎使用 |

只有一个模糊的 cloud、hosting 或城市标签时，不应直接大范围封锁。

## 9. 浏览器端可信交互

在受保护路径监听：

~~~text
pointerdown
touchstart
keydown
scroll
visibilitychange
~~~

只计算：

~~~js
event.isTrusted === true
~~~

这能过滤普通脚本通过 dispatchEvent() 伪造的事件，但不能证明访问者一定是真人。高级浏览器自动化仍可能产生可信事件，因此它只能是联合信号。

每个页面记录：

~~~text
trusted_interactions
dwell_ms
behavior_final
trigger = load | behavior | pagehide | pageshow
~~~

建议在页面加载约 5 至 6 秒后发送一次行为快照，并在 pagehide 时用 keepalive 发送最终状态。

## 10. 三种关联键

### 10.1 Session Key

浏览器首次访问时在 sessionStorage 生成随机 UUID：

~~~text
session_key = random UUID
~~~

作用：

- 关联同一标签页会话。
- 绑定验证结果。
- 防止验证结果被当作长期 Cookie 使用。

### 10.2 Visitor Signature

从以下浏览器信息生成一个轻量哈希：

~~~text
User-Agent
platform
primary language
screen width / height / color depth
timezone
hardware concurrency
device memory
max touch points
~~~

它用于快速关联相似浏览器，但碰撞概率和可伪造性都存在，不能单独定罪。

### 10.3 Campaign Key

Campaign key 是更精确、也更容易随环境变化的短期关联键。建议输入：

~~~text
visitor_signature
User-Agent
Sec-CH-UA
Sec-CH-UA-Platform
Sec-CH-UA-Mobile
Accept-Language
TLS cipher hash
TLS extension hash
TLS ClientHello length
TLS version
HTTP protocol
~~~

Worker 使用 HMAC-SHA256：

~~~text
campaign_key = "c1-" + truncate(HMAC(secret, canonical_signals))
~~~

IP、ASN 和国家不要放进 key 本身，否则代理轮换会被拆成大量新身份，无法计算网络变化。

### 10.4 Cohort Key

Cohort key 专门解决对方同时更换 IP、ISP、User-Agent 或 TLS 特征造成的过度分裂。

客户端只生成粗粒度 seed：

~~~text
version
platform
primary language
timezone
screen geometry and color depth
bucketed hardware concurrency
bucketed device memory
bucketed touch points
~~~

Worker 规范化后使用独立域前缀做 HMAC：

~~~text
cohort_key = "h1-" + truncate(
  HMAC(secret, "risk-shield-cohort-v1\n" + normalized_seed)
)
~~~

只保存 HMAC 结果，不保存原始 seed。Cohort key 不是用户身份，也不应用于广告画像或跨站跟踪。

## 11. 行为时间窗与建议阈值

以下阈值是起点，必须先在自己的 log_only 数据中校准。

### 11.1 90 秒快速翻页

满足全部条件时触发 Challenge：

~~~text
3 个不同受保护页面
至少 2 个页面停留不超过 7 秒
0 个可信交互页面
~~~

### 11.2 10 分钟早期网络轮换

满足全部条件时触发 Challenge：

~~~text
3 个受保护页面
2 个 IP
2 个 ASN
0 个可信交互页面
~~~

### 11.3 10 分钟快速零交互轮换

满足全部条件时触发 Challenge：

~~~text
4 个受保护页面
3 个 IP
2 个 ASN
至少 3 个快速退出页面
0 个可信交互页面
~~~

### 11.4 10 分钟重度网络轮换

满足全部条件时触发 Challenge：

~~~text
5 个受保护页面
4 个 IP
3 个 ASN
~~~

### 11.5 10 分钟住宅代理池特征

满足全部条件时触发 Challenge：

~~~text
10 个受保护页面
10 个 IP
4 个 ASN
~~~

### 11.6 10 分钟跨国家 cohort

满足全部条件时触发 Challenge：

~~~text
4 个受保护页面
3 个 IP
2 个 ASN
2 个国家
~~~

### 11.7 30 分钟极端 cohort

满足全部条件：

~~~text
6 个受保护页面
6 个 IP
4 个 ASN
3 个国家
~~~

动作：

~~~text
全程 0 可信交互 -> Redirect
存在可信交互 -> Challenge
~~~

这是保护真实企业 VPN、移动网络切换和远程办公访客的重要分叉。

## 12. 动态蜜罐

在受保护页面通过 shield.js 动态插入一个不可见链接：

~~~html
<a
  href="https://<SHIELD_ORIGIN>/trap/<NONCE>"
  rel="nofollow"
  aria-hidden="true"
  tabindex="-1"
  style="position:absolute;width:1px;height:1px;overflow:hidden;pointer-events:none"
></a>
~~~

链接附带短期 session、visitor signature 和 cohort 关联信息，但不包含私钥。

蜜罐命中不应单独判死刑。推荐只有同时满足以下条件才 Challenge：

~~~text
至少 1 次蜜罐命中
至少 2 个受保护页面
至少 1 个快速退出页面
0 个可信交互页面
~~~

原因是预取器、可访问性工具或安全扫描器也可能读取隐藏链接。

## 13. 自动化浏览器检测

navigator.webdriver === true 可以作为受保护路径的 Challenge 信号，但不能作为完整结论。

不要依赖：

- 单一 Headless 字样。
- 单一浏览器版本。
- 单一屏幕尺寸。
- 单一 WebGL 或 Canvas 指纹。

更稳妥的方法是把自动化信号与路径数量、交互、停留和网络轮换联合起来。

## 14. Turnstile 验证流程

### 14.1 触发

Worker 返回：

~~~json
{
  "action": "challenge",
  "target": "<SAFE_CONTENT_URL>",
  "score": 72
}
~~~

浏览器立即覆盖页面并加载托管验证组件。

### 14.2 服务端校验

浏览器提交：

~~~json
{
  "token": "<TURNSTILE_TOKEN>",
  "sessionKey": "<SESSION_UUID>",
  "visitorSignature": "<VISITOR_SIGNATURE>",
  "path": "/protected/example"
}
~~~

Worker 必须：

- 使用只存在于 Worker Secret 的私钥请求官方验证接口。
- 绑定当前请求 IP。
- 校验返回 hostname 属于允许的 storefront 域名。
- 拒绝过短、过长、重复、过期或失败 Token。
- 成功后创建短效验证会话，例如 15 分钟。

Turnstile 私钥绝不能写进主题、浏览器脚本、Git 仓库、截图或 Markdown 文档。

### 14.3 失败出口

以下情况统一跳到 <SAFE_CONTENT_URL>：

- 验证失败。
- Token 过期。
- 组件加载失败。
- 验证接口异常。
- 用户超过例如 15 秒未完成验证。

### 14.4 验证会话撤销

一次通过不能永久放行。验证后如果同一个 session 与 visitor signature 出现：

~~~text
4 个 IP
3 个 ASN
2 个国家
~~~

则立即删除验证会话，并 Redirect 到安全内容区。这能限制打码平台和 Token 池复用。

## 15. 返回、刷新和缓存绕过

浏览器可能通过 back-forward cache 恢复旧页面。客户端应监听：

~~~js
window.addEventListener("pageshow", function (event) {
  if (event.persisted) runRiskCheck("pageshow");
});
~~~

跳转使用：

~~~js
window.location.replace("<SAFE_CONTENT_URL>");
~~~

这样当前受保护页面不会继续保留在普通历史栈中。

shield.js 响应建议：

~~~http
Cache-Control: no-store, max-age=0
Vary: Referer, User-Agent
~~~

## 16. Worker 接口

推荐接口：

~~~text
GET  /health         健康检查
GET  /shield.js      返回动态客户端脚本
POST /check          提交页面和行为信号
POST /verify         服务端验证 Turnstile
GET  /trap/:nonce    记录动态蜜罐访问
GET  /events         管理员读取近期事件
GET  /export.csv     管理员导出事件
~~~

/events 和 /export.csv 必须要求管理认证，并限制返回数量。

## 17. 通用请求与响应协议

### 17.1 /check 请求

~~~json
{
  "url": "https://<STOREFRONT_ORIGIN>/products/example",
  "path": "/products/example",
  "referrer": "",
  "sessionKey": "<SESSION_UUID>",
  "trigger": "load",
  "screen": "1920x1080",
  "timezone": "Region/City",
  "isWebdriver": false,
  "visitorSignature": "v1-<HASH>",
  "cohortSeed": "h1|<COARSE_VALUES>",
  "trustedInteractionCount": 0,
  "dwellMs": 0,
  "behaviorFinal": false
}
~~~

### 17.2 /check 响应

~~~json
{
  "action": "allow | challenge | redirect",
  "target": "<SAFE_CONTENT_URL_OR_NULL>",
  "score": 0,
  "reasons": ["<GENERIC_REASON>"],
  "mode": "log_only | enforce"
}
~~~

生产前端可以不显示 reasons，但后台日志应保留可解释性。

## 18. 数据库结构

### 18.1 events

~~~sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip TEXT,
  ip_range TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  asn INTEGER,
  as_organization TEXT,
  provider_name TEXT,
  colo TEXT,
  url TEXT,
  path TEXT,
  referrer TEXT,
  user_agent TEXT,
  decision TEXT NOT NULL,
  score INTEGER NOT NULL,
  reasons_json TEXT,
  rule_ids_json TEXT,
  session_key TEXT,
  visitor_signature TEXT,
  campaign_key TEXT,
  cohort_key TEXT,
  protected_path INTEGER NOT NULL DEFAULT 0,
  trigger TEXT,
  trusted_interactions INTEGER NOT NULL DEFAULT 0,
  dwell_ms INTEGER NOT NULL DEFAULT 0,
  behavior_final INTEGER NOT NULL DEFAULT 0
);
~~~

### 18.2 trap_hits

~~~sql
CREATE TABLE trap_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip TEXT,
  country TEXT,
  asn INTEGER,
  user_agent TEXT,
  visitor_signature TEXT,
  campaign_key TEXT,
  cohort_key TEXT,
  session_key TEXT,
  nonce TEXT
);
~~~

### 18.3 verified_sessions

~~~sql
CREATE TABLE verified_sessions (
  session_key TEXT PRIMARY KEY,
  visitor_signature TEXT NOT NULL,
  verified_ip TEXT,
  verified_asn INTEGER,
  verified_country TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
~~~

### 18.4 索引

至少为以下组合建立时间索引：

~~~text
campaign_key + created_at
cohort_key + created_at
visitor_signature + created_at
session_key + created_at
decision + created_at
protected_path + created_at
~~~

## 19. 配置与 Secret

公开配置示例：

~~~toml
MODE = "log_only"
SAFE_CONTENT_URL = "https://<STOREFRONT_ORIGIN>/safe-content"
ALLOWED_ORIGINS = "https://<STOREFRONT_ORIGIN>"
PROTECTED_PATH_PREFIXES = "/products,/collections,/pages,/knowledge,/account,/search"
BLOCK_COUNTRIES = ""
BLOCK_BOT_TERMS = ""
BLOCK_PROVIDER_TERMS = ""
BLOCK_ASNS = ""
BLOCK_IPS = ""
~~~

只存入 Worker Secret：

~~~text
ADMIN_TOKEN
IP_INTELLIGENCE_TOKEN
TURNSTILE_SECRET
CAMPAIGN_HMAC_SECRET
~~~

浏览器可见但不保密：

~~~text
TURNSTILE_SITEKEY
~~~

不要把 Global API Key 当成运行时 Worker Secret。部署凭证和运行时凭证应分开。

## 20. CORS、输入校验与管理接口

必须具备：

- Access-Control-Allow-Origin 只回显允许的 storefront origin。
- 拒绝未知 origin 的跨站写入。
- 限制请求 body 大小。
- 规范化 path、trigger、整数和签名长度。
- 拒绝不符合格式的 session key 和 cohort seed。
- 管理接口使用可靠认证。
- CSV 导出转义逗号、引号和换行。
- 健康检查不返回配置、密钥或数据库信息。

## 21. Fail-open 与故障处理

行为聚合数据库暂时不可用时，不应该仅因为查不到风险数据就阻止真实买家。

推荐：

~~~text
静态明确高风险规则仍可执行
行为聚合失败 -> 记录告警并按无行为证据处理
Turnstile 未配置 -> log_only 或 allow，不显示无法完成的挑战
客户端 /check 网络失败 -> 允许当前页面继续
安全内容 URL 缺失 -> 使用本地、已验证的安全默认路径
~~~

事件写入失败不应泄露堆栈给浏览器。高并发场景可将日志异步写入队列。

## 22. log_only 与 enforce

### log_only

~~~text
照常计算原始决定
完整记录 score、reasons、rule_ids
对浏览器返回 allow
~~~

适合初次部署、新规则观察、更换主题后的回归期和调整阈值前的误伤评估。

### enforce

~~~text
allow -> 正常访问
challenge -> 显示验证
redirect -> 跳到安全内容区
~~~

只有白名单、路径豁免和真实买家样本验证通过后才切换。

## 23. 监控指标

每天或每周至少检查：

- allow / challenge / redirect 总量。
- 不同 IP、ASN、国家和路径数量。
- 受保护路径中的高频 allow 群组。
- 验证成功率、失败率和超时率。
- 验证后会话撤销数量。
- 每条规则的命中量和误伤反馈。
- 已验证搜索 crawler 的抓取页面数。
- 安全内容落地点的跳转量。
- 真实转化事件是否下降。
- 数据库和 Worker 错误率。

最重要的异常查询不是谁被挡了，而是：

~~~text
哪些未验证群组被允许访问了大量受保护页面？
~~~

## 24. 测试矩阵

### 24.1 单元测试

至少覆盖：

- locale 路径剥离。
- 安全内容路径不发生循环。
- 已验证 crawler 放行。
- 假 crawler UA 未通过来源验证。
- 精确已确认指纹只在受保护路径 Redirect。
- VPN、Proxy、Hosting、Tor 评分。
- navigator.webdriver 触发 Challenge。
- 90 秒快速零交互规则。
- 10 分钟 IP/ASN/国家轮换规则。
- 30 分钟 cohort 分叉规则。
- 蜜罐不会单独定罪。
- Turnstile 成功、失败、超时和 hostname 不匹配。
- 验证后网络异常撤销。
- log_only 永远不执行浏览器阻断。
- 行为数据库异常时 fail-open。

### 24.2 浏览器测试

至少覆盖：

- 普通桌面买家。
- 普通移动买家。
- 企业 VPN 真实用户。
- 搜索引擎检查工具。
- 无头浏览器。
- 返回上一页和刷新。
- 多语言路径。
- 购物车和结账。
- 安全内容落地点。

### 24.3 生产只读验证

验证内容：

~~~text
shield.js 返回 200
Cache-Control 为 no-store
普通页面只加载一次脚本
豁免页面不产生跳转循环
受保护路径能产生日志
搜索 crawler 仍可访问多个路径
不存在未知高频 protected-path allow 群组
~~~

## 25. 部署顺序

1. 创建 Worker、数据库和健康检查。
2. 设置 Secret，不把任何 Secret 放进仓库。
3. 部署 shield.js、check、verify 和日志接口。
4. 在预览主题早期 head 加载脚本。
5. 使用 log_only 运行至少一个正常业务周期。
6. 验证搜索、AI crawler、移动端、购物车和结账。
7. 只启用明确静态规则。
8. 启用 Challenge，不先启用宽泛 Redirect。
9. 观察 cohort 和交互数据。
10. 对证据充分的极端零交互群组启用 Redirect。
11. 在正式主题上线后继续观察误伤和转化。

## 26. 回滚

最快的软回滚：

~~~text
MODE = log_only
~~~

第二层回滚：

~~~text
清空新增 BLOCK_* 或 PROTECTED_* 规则
保留日志
~~~

紧急回滚：

~~~html
<!-- 暂时移除早期 shield.js script tag -->
~~~

回滚后仍要保留故障时段日志，判断是 Worker、数据库、验证组件、路径配置还是第三方网络问题。

## 27. 不建议采用的方法

- 不要因为某个城市出现流量就封整个城市。
- 不要因为某个国家出现爬虫就封整个国家。
- 不要把所有大型云平台网络整体封掉。
- 不要仅凭 event.isTrusted 判定真人。
- 不要仅凭 User-Agent 判定可信 crawler。
- 不要使用隐藏文字、零宽字符或字体混淆破坏 SEO/GEO。
- 不要把核心公开文本改成纯 Canvas、图片或客户端异步内容。
- 不要对爬虫执行攻击、资源消耗、恶意跳转或报复行为。
- 不要把广告收益与高风险自动化流量绑定。
- 不要让验证页面覆盖购物车、结账或支付流程。

## 28. 隐私原则

- 只收集防御所需的最少字段。
- 对 campaign 和 cohort 使用 HMAC，而不是保存完整原始指纹。
- 不把这些键用于广告画像。
- 设置明确的数据保留周期，例如 30 至 90 天。
- 对管理导出进行访问控制和审计。
- 在隐私政策中披露安全与反滥用日志。
- 根据适用地区的隐私法规调整 IP 和设备数据处理。

## 29. 给 AI 编程代理的实施 Prompt

~~~text
Build a generic storefront crawler-risk shield using an edge Worker, an early-loading client script, a lightweight SQL database, and managed browser verification.

Do not use any real company, domain, industry, IP, ASN, provider blocklist, customer data, account ID, database ID, API token, or production incident detail. Use placeholders throughout.

Required architecture:
- GET /shield.js returns a no-store client script.
- POST /check accepts page path, session key, visitor signature, coarse cohort seed, trusted-interaction count, dwell time, trigger, and webdriver state.
- POST /verify validates a managed verification token server-side and checks the allowed hostname.
- GET /trap/:nonce records a dynamic honeypot hit.
- GET /health returns only a minimal health response.
- GET /events and GET /export.csv require administrator authentication.

Required decisions:
- allow
- challenge
- redirect to configurable SAFE_CONTENT_URL

Required safeguards:
- Exact-origin CORS.
- log_only and enforce modes.
- Locale-aware protected-path matching.
- Exempt cart, checkout, admin, access-denied, and SAFE_CONTENT_URL paths.
- Validate trusted crawler source; do not trust User-Agent alone.
- Never store Worker secrets in frontend code or source control.
- Behavior aggregation failure must not itself block a shopper.
- Client /check failure must fail open.
- Prevent redirect loops and re-check pages restored from browser back-forward cache.

Behavior signals:
- Count only pointerdown, touchstart, keydown, scroll, and visibilitychange events where event.isTrusted is true.
- Record trusted interactions, dwell time, and final behavior on pagehide.
- Generate a short-lived session key in sessionStorage.
- Generate a coarse visitor signature for local correlation.
- Generate a precise campaign HMAC from browser, Client Hint, TLS, and HTTP characteristics without including IP, ASN, or country.
- Generate a second coarse cohort HMAC from platform, primary language, timezone, screen geometry/depth, and bucketed device capabilities.
- Store only HMAC results, never the raw cohort seed.

Starting thresholds:
- 3 protected pages in 90 seconds + 2 rapid exits <= 7 seconds + zero trusted interaction pages: challenge.
- 3 protected pages + 2 IPs + 2 ASNs + zero trusted interaction pages in 10 minutes: challenge.
- 4 protected pages + 3 IPs + 2 ASNs + 2 countries in 10 minutes: challenge.
- 5 protected pages + 4 IPs + 3 ASNs in 10 minutes: challenge.
- 10 protected pages + 10 IPs + 4 ASNs in 10 minutes: challenge.
- 6 protected pages + 6 IPs + 4 ASNs + 3 countries in 30 minutes: redirect if there were zero trusted interactions; otherwise challenge.
- A honeypot hit must be corroborated by protected-page enumeration and zero trusted interaction before challenge.
- navigator.webdriver on a protected path: challenge.

Verification:
- Successful verification creates a 15-minute session bound to session key and visitor signature.
- Revoke that session and redirect if it later spans 4 IPs, 3 ASNs, and 2 countries.
- Failed, expired, repeated, timed-out, or unavailable verification redirects to SAFE_CONTENT_URL.

Testing:
- Write unit tests for every rule and precedence branch.
- Test locale routes, safe-content loop prevention, cart/checkout exemptions, fake crawler UAs, real crawler source validation, fail-open behavior, Turnstile hostname validation, session revocation, pageshow re-check, and log_only mode.
- Provide a deployment checklist, rollback procedure, and sample monitoring queries.

This is a defensive system. Do not implement retaliation, resource exhaustion, malicious redirects, credential collection, or offensive scanning.

~~~

## 30. 最终定位

这套系统不是传统封 IP 插件，也不是完整的边缘 WAF。它是一套证据驱动的流量信誉层：

~~~text
静态风险情报
    + 浏览器可信交互
    + 页面访问节奏
    + IP / ASN / 国家轮换
    + 精确 campaign 关联
    + 粗粒度 cohort 关联
    + 蜜罐辅助证据
    + 托管式人机验证
    = Allow / Challenge / Safe Redirect
~~~

它最适合保护公开网站中的规模化可抓取资产，同时保持真实访客、搜索引擎和 AI 搜索的正常访问。真正的秘密仍然必须放在公开 HTML 之外。
