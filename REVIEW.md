# Relatório de Qualidade — resend-email-mcp

**Data:** 2026-06-08
**Auditores:** agentes `code-reviewer` + `security-reviewer`
**Versão auditada:** 1.0.0 (75 tools + 2 resources)

## Resumo Executivo

| Dimensão | Status inicial | Status pós-correções |
|----------|:---:|:---:|
| Segurança | ⚠️ 4 médios + 3 recs | ✅ corrigidos |
| Qualidade de código | ⚠️ 2 médios + 3 baixos | ✅ corrigidos / aceitos |
| Padrões MCP | ✅ | ✅ |
| Documentação | ✅ | ✅ |
| Publicação (secrets) | ✅ | ✅ |

## Certificado

🏆 **APROVADO PARA PRODUÇÃO** (após o hardening abaixo)

Auditoria inicial classificou como "Requer Correções" para release npm público por dois caminhos de exfiltração de segredo sob prompt injection. Ambos foram fechados e validados ao vivo.

---

## Correções aplicadas

### Segurança

| ID | Finding (OWASP) | Correção | Verificação |
|----|------------------|----------|-------------|
| S1 | SSRF / leak da API key via `resend_raw` + `buildUrl` (A10) | `buildUrl` agora afirma `url.origin === baseOrigin`; normalização de path. Vetores `@evil.com`, `//evil.com`, `https://evil.com`, `..//` todos resolvem para `api.resend.com` | ✅ fetch-spy: Bearer nunca sai do host oficial |
| S2 | Leitura arbitrária de arquivos via `attachment.localPath` (A01) | Leitura de disco **desabilitada por padrão**; só habilita via `RESEND_ATTACHMENTS_DIR` e restrita a esse diretório (anti-traversal + cap de 20MB) | ✅ desabilitado sem env, traversal bloqueado, arquivo legítimo lido |
| S3 | `RESEND_BASE_URL` sem validação (A05) | Validação no construtor: URL válida + `https` obrigatório (`http` só p/ localhost) | ✅ `http://evil` rejeitado, localhost permitido |
| S4 | `idParam` sem encode → injeção de path (A03) | `idParam` agora regex `^[A-Za-z0-9_-]+$`; emails validados (`.email()`/loose), webhook endpoint `https` `.url()`, headers custom sem CRLF, limites de tamanho em body/anexo | ✅ `../../x` rejeitado, válidos aceitos |

### Qualidade

| ID | Finding | Correção |
|----|---------|----------|
| C1 | `analyze_deliverability`/`audit_account` só veem 1 página | Descrições deixam explícito "100 mais recentes (1 página)" |
| C2 | `update_*` com só `id` → PATCH vazio | Helper `buildUpdateBody` lança "Nothing to update" nos 6 handlers |
| C3 | Contagem de tools divergente (74 vs 75) | `strat-project.json` alinhado para 75 + 2 resources |

### Aceitos sem mudança (decisões de produto, baixo impacto)
- `resend_raw` `idempotentHint` estático = false (annotation não vê args em runtime; GET já liberado no readonly guard).
- `test_send` bloqueado em readonly (faz POST; comportamento coerente com o guard).

## Itens verificados e aprovados
- Sem secrets hardcoded no código; `.gitignore` cobre `.env`; `npm pack` não empacota `.env`.
- `Authorization` em header (não em URL); `ResendError.toReadable()` não vaza body/chave.
- Padrão `defineTool` consistente nas 75 tools; Zod em 100%; erros traduzidos com hint.
- `asArray` normaliza formatos de lista; mapeamento camelCase→snake_case correto.
- Camada de debug validada ao vivo (detectou endereço suprimido real na conta).

## Próximos passos
1. Rotacionar a `RESEND_API_KEY` usada em dev (passou por prompts/chat). — recomendado
2. `/publish resend-email-mcp` — pronto para GitHub + npm + diretórios.
