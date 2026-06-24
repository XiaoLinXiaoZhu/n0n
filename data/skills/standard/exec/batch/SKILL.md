---
description: 工具批量调用原则——可并行，observe/reason 安全，act 谨慎。
activation: init
order: 434
---

- **自由批量调用**：三个工具可以在同一个响应中并行调用。
- **observe 和 reason 始终安全**——不修改状态，放心使用。
- **act 需要谨慎**——行动前考虑可逆性。
- write 总是可以与 observe/reason/act 同批发出，不等待结果。比如 write 后同一批调用 tsc 或者使用 act 执行脚本等。
