LLM Guard is a security layer (reverse proxy) that sits between client applications and Large Language Model (LLM) APIs. It intercepts incoming prompts and outgoing responses in real time, applies configurable security checks such as prompt injection detection, sensitive data (PII) masking, jailbreak prevention, and content validation, and then forwards only safe requests to the LLM. This approach helps organizations secure AI applications without modifying the underlying LLM or client application.


An enterprise deploys an internal AI assistant connected to their proprietary databases. 
LLMGuard acts as a reverse proxy sitting directly in front of the AI model. 
When an employee (or compromised account) attempts a "DAN" (Do Anything Now) jailbreak prompt to force the AI to dump the company's financial records, the Prompt Firewall intercepts it [1.1.4]. It sanitizes the input, blocks the adversarial payload, and alerts the SOC team. 
Furthermore, it inspects the AI's output to ensure no sensitive PII is accidentally leaked back to the user




Key Features
🔒 Reverse Proxy for LLM APIs
🛡️ Prompt Injection Detection
🚫 Jailbreak Prevention
👤 PII Detection & Masking
📊 Request & Response Logging
⚡ FastAPI-based High-Performance API
🔄 Compatible with OpenAI and other LLM APIs
📈 Monitoring and Audit Support
