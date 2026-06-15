---
description: 函数式编程。纯函数、不可变数据、Readonly 类型技巧。
activation: init
order: 230
---

# 函数式编程

大部分情况下使用函数式编程的思路，将函数纯化——纯函数更容易测试、更容易推理、更容易组合。

## 核心原则

- 优先纯函数：同样的输入产生同样的输出，无副作用
- 副作用集中在系统边界（IO、网络、文件、数据库）
- 用不可变数据结构，避免原地修改
- 仅在性能关键路径做少量妥协

## 不可变数据

```typescript
// 不好：原地修改，调用者不知道输入被污染
const addTopping = (pizza: Pizza, topping: Topping): void => {
  pizza.toppings.push(topping);
};

// 好：返回新值，输入不变
const addTopping = (pizza: Pizza, topping: Topping): Pizza => ({
  ...pizza,
  toppings: [...pizza.toppings, topping],
});
```

## Readonly 技巧

在 TypeScript 中，将输入参数声明为 `Readonly` 可以在类型层面承诺"此函数不会修改你的数据"，让调用者无需猜测副作用：

```typescript
// 调用者看了签名会犹豫：这个函数会不会改我的数组？
const processItems = (items: Item[]): Result => {
  // ...
};

// 调用者一看就知道安全：Readonly 承诺不修改
const processItems = (items: Readonly<Item[]>): Result => {
  // 如果内部尝试 items.push(...)，编译器会报错
};
```

适用于所有引用类型：

```typescript
// Readonly 数组
const sort = (xs: Readonly<number[]>): number[] => [...xs].sort();

// Readonly 对象
const formatUser = (user: Readonly<User>): string => user.name;

// Readonly Map / Set
const lookup = (m: ReadonlyMap<string, Value>, key: string): Value | undefined => m.get(key);
```

只在真正返回新数据的函数上使用——如果函数本身就是做副作用的（写数据库、发网络请求），`Readonly` 反而会产生虚假的安全感。
