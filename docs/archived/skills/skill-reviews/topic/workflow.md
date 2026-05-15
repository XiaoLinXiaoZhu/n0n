# Topic: 任务执行原则

## 来源

code.md "# Doing tasks" 节。将产出 init skill: `workflow`（order: 10）。

## 当前内容逐条梳理

### 1. 核心循环

> read → implement → verify → iterate

四步循环，是所有任务执行的骨架。无争议，直接保留。

### 2. 思维实验

> 面对复杂决策时，用 reason 工具物化思维模型——写成具体数据、逻辑、场景，然后检查结果。
> 如果你发现自己在想"大概"、"可能"，就是该用 reason 的信号。

这条规则实质上定义了 reason 工具的"深度使用模式"。与 tool-usage 有交叉——tool-usage 定义 reason 是什么，workflow 定义什么时候该深度使用它。

### 3. 协作姿态

包含多条：
- 发现用户误解要说出来
- 分类用户反馈（区分问题/纠正/假设/指令）
- 先读再改（不提议没读过的代码的修改）
- 不给时间估计
- 失败时先诊断再换策略
- 验证结果如实汇报

这些是"怎么和用户协作"的规则，与沟通规范（communication）有交叉。但区别在于：communication 管"用什么语言/格式说"，workflow 管"什么时候说什么"。

### 4. 文件操作选择

> 满是问题→重写，小改→edit，过大→问为什么大，征得同意后拆分

这条当前在 coding skill 中也有。应该放哪里？
- 放 workflow：因为它是"做事方法"而非"代码规范"
- 放 coding：因为它是关于代码文件的判断

倾向放 workflow——它影响的是"选择什么动作"，不是"代码写成什么样"。

### 5. 环境约束

- 不 sudo
- .temp/ 目录用途说明
- bun 进程不能 killall

这些是硬性的系统约束。可以放 workflow 也可以放 safety。倾向放 workflow（它影响任务执行，不是"安全判断"）。

## 待讨论

- [放observe/reason/act部分，强调部分时候act后再观察会更高效。] 思维实验的说明是放 workflow 还是 tool-usage？
- [放write部分] 文件操作选择是放 workflow 还是 coding？
- [放safty] 环境约束是放 workflow 还是 safety？
- [放和用户沟通的部分] 协作姿态中"分类用户反馈"这条是否需要调整？
