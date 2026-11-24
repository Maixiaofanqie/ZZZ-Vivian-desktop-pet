# 文档索引

公开文档面向使用者、构建者与贡献者。内部开发日志、阶段验收与决策清单不随公开仓库发布。

## 阅读顺序

1. [用户手册](user-guide.md)：安装、操作、设置、模块、数据、卸载与常见问题。
2. [从源码构建](../BUILDING.md)：环境、命令、打包与角色美术 overlay 规则。
3. [架构设计](architecture.md)：进程模型、窗口、IPC、模块、存储与日志。
4. [视觉与交互规范](design.md)：色彩、字体、尺寸、气泡、动效与文案语气。
5. [技术选型](tech-stack.md)：技术栈、版本策略、性能预算与安全约束。
6. [代码规范](code-style.md)：命名、边界、提交与质量门禁。
7. [模块开发指南](module-guide.md)：模块契约、生命周期与检查清单。
8. [素材规范](assets.md)：目录、命名、字体、授权与交付检查。

## 架构决策记录（ADR）

| 编号                                     | 主题                                               | 状态   |
| ---------------------------------------- | -------------------------------------------------- | ------ |
| [001](adr/001-electron.md)               | 技术栈选择 Electron                                | 已接受 |
| [003](adr/003-claude-code.md)            | Claude Code 联动：只读元数据 + 定期扫描 + 功能面板 | 已接受 |
| [004](adr/004-ai-chat-deferred.md)       | AI 聊天暂缓                                        | 已接受 |
| [006](adr/006-non-commercial-release.md) | v1.0 非商业公开发布与安装包策略                    | 已接受 |

## 仓库级文件

- [README](../README.md) / [English summary](../README.en.md)
- [贡献指南](../CONTRIBUTING.md)
- [行为准则](../CODE_OF_CONDUCT.md)
- [安全策略](../SECURITY.md)
- [更新日志](../CHANGELOG.md)
- [许可](../LICENSE) / [素材授权](../LICENSE-ASSETS) / [第三方声明](../NOTICE)
