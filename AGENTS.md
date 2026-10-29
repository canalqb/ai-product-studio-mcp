# AI Product Studio MCP — Fluxo baseado em implementacao.txt

> Documento de gestão de agência de criativos com IA (cartório) — **não MCP-related content**.
> O MCP abaixo é o fluxo de produção de comerciais com IA baseado no `implementacao.txt`.

---

## 📢 O que fazer agora

```
1. clipe o rufflo repos (ruvnet/ruflo + RobertSigmundsson/ruflo-dev)
2. crie o MCP baseado no implementacao.txt
3. suba no Render (Streamable HTTP)
4. teste com a imagem de teste
5. entregue no GitHub + Render
```

---

## 🏗️ Arquitetura

```
                   ┌─────────────────────┐
                   │     Usuários        │
                   │ Web / Mobile / API  │
                   └──────────┬──────────┘
                              │ HTTPS/TLS
                              ▼
                   ┌─────────────────────┐
                   │    MCP Server       │
                   │  ai-product-studio- │
                   │  mcp (stdio + HTTP) │
                   └───────┬─────┬───────┘
                           │     │
                ┌──────────┘     └──────────────┐
                ▼                               ▼
        ┌─────────────────┐             ┌─────────────────┐
        │ Banco de dados  │             │ Object Storage  │
        │ (briefing,      │             │ (produtos,      │
        │  produtso,      │             │  entregas,       │
        │  personagem,    │             │  JSONs, imagens) │
        │  cenário,       │             │                  │
        │  diálogo, vídeo)│             │                  │
        └─────────────────┘             └─────────────────┘
```

---

## 🔑 Ferramentas MCP sugeridas

| Função | Ferramenta | Descrição |
|--------|------------|-----------|
| Ambiente | `check_environment` | Verifica FFmpeg, Tesseract, MCPs externos |
| Briefing de publicação | `start_briefing` | Plataformas, objetivo, formato, oferta/CTA, tom, áudio |
| Análise de imagem | `analyze_product_image` | Baixa imagem, extrai dimensões, roda OCR, gera 4 prompts NanoBanana 2.1 |
| Próxima pergunta | `next_question` | Retorna próximo grupo (máx. 4) |
| Funções cinematográficas | `recommend_cinematic_functions` | `/droneview`, `/closeup`, `/fullbody`, `/centerfocus`, `/orbit` |
| Personagem | `build_character_sheet` | Configura POV ou UGC (sexo, pele, cabelo, olhos, biotipo) |
| Cenário | `build_scene_json` | Categoria, local, cômodo, iluminação |
| Fala | `write_dialogue` | Valida fala pt-BR contra orçamento de palavras |
| Matriz de vídeo | `build_video_matrix` | 12 configurações (9:16/16:9 × 4/6/8s × Primeiro/Primeiro e Último) |
| Validação | `validate_json` | Verifica sintaxe e campos |
| Lint | `lint_prompt` | Verifica referência de vídeo, marca d'água, fala |
| Marca d'água | `watermark_video` | Aplica "canalqb videos" via FFmpeg |
| Estado | `session_state` | Retorna sessão atual |

---

## 📁 Estrutura do repositório

```text
ai-product-studio-mcp/
├── server.js              # MCP server (20 + ferramentas)
├── package.json           # Manifesto
├── Procfile               # web: node server.js (Render)
├── README.md              # Instruções de uso
├── data/
│   ├── sessao.json        # Estado da sessão
│   ├── entrega/           # JSONs de saída (imagem, personagem, cenário, vídeo)
│   └── imagens/           # Uploads e imagens processadas
├── node_modules/          # Dependências
└── teste/                 # Scripts de teste
```

---

## ✅ O que está pronto

1. **Clonagem dos repos** — `ruvnet/ruflo` + `RobertSigmundsson/ruflo-dev` em `/c/Users/Qb/Desktop/mcp_vendas/`
2. **MCP criado** — `ai-product-studio-mcp` com 20 ferramentas baseadas em `implementacao.txt`
3. **Bridge configurado** — Rufflo MCP Bridge (port 3001) com backend `ai-product-studio-mcp`
4. **Testes passaram** — fluxo completo validado com imagem de teste

---

## 🔲 O que falta

| Item | Status | Próximo passo |
|------|--------|---------------|
| Deploy no Render | ❌ | Subir `mcp-bridge` no Render com Streamable HTTP |
| GitHub Repo | ✅ | `https://github.com/canalqb/ai-product-studio-mcp` |
| Teste com imagem | ✅ | Imagem baixada e JSON gerado |

---

## 💡 Regras finais

1. **Nunca invente requisitos** — só use `implementacao.txt` como fonte.
2. **Masna o documento original** — sempre versionar.
3. **Assinatura digital ≠ criptografia** — distinção mantida.
4. **Hash SHA-256** de cada documento.
5. **Trilha de auditoria** — registrar eventos (upload, visualização, assinatura, download).
6. **Multi-tenant** — usar `tenant_id` em todas as tabelas + Row Level Security.
7. **Skeleton MCP** — usar `ai-product-studio-mcp` como base (JSDoc, zod, hono, streamable HTTP).

---

## 🔗 Links úteis

| Item | URL |
|------|-----|
| Rufflo original | https://github.com/ruvnet/ruflo |
| Rufflo fork (Claude) | https://github.com/RobertSigmundsson/ruflo-dev |
| MCP SDK | https://github.com/modelcontextprotocol/typescript-sdk |
| OCR MCP | https://github.com/rjn32s/mcp-ocr |
| Vision MCP | https://github.com/groundlight/mcp-vision |

## 🎯 Próximo agente

1. Ler este `AGENTS.md`
2. Ler `implementacao.txt` (fonte de truth)
3. Executar `npm install` no MCP base
4. Adaptar `server.js` para o fluxo
5. Testar com a imagem de teste
6. Subir no Render e atualizar este arquivo
