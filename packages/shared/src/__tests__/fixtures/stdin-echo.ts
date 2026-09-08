/** 测试 fixture：读取 stdin 到 EOF，然后输出 EOF 标记。 */

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
	chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
}
console.log(`EOF:${Buffer.concat(chunks).toString("utf8")}`);
