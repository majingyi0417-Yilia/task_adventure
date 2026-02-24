export default function TestPage() {
  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>环境变量测试</h1>
      <p>API Key 是否存在: {process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY ? "是" : "否"}</p>
      <p>API Key 长度: {process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY?.length}</p>
      <p>API Key 前10位: {process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY?.slice(0, 10)}...</p>
      
      <div style={{ marginTop: "2rem", background: "#f0f0f0", padding: "1rem" }}>
        <h2>说明：</h2>
        <ul>
          <li>如果显示"否"，说明环境变量未设置</li>
          <li>如果显示长度，但不正确，可能是密钥格式错误</li>
          <li>正常情况下，应该能看到 sk-... 开头的密钥前10位</li>
        </ul>
      </div>
    </div>
  );
}