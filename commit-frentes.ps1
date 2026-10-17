# Faz os commits pendentes das Frentes 1 e 2. Rode no PowerShell, na pasta do projeto:
#   .\commit-frentes.ps1
# (O assistente não consegue escrever em .git neste ambiente.) Apague este arquivo depois.
$ErrorActionPreference = "Stop"

function Run($args_) {
  & git @args_
  if ($LASTEXITCODE -ne 0) { throw "git $($args_ -join ' ') falhou (código $LASTEXITCODE)" }
}

$branch = (git branch --show-current).Trim()
if ($branch -ne "frente-2-agente-pedidos") {
  throw "Estou na branch '$branch'. Rode antes: git checkout frente-2-agente-pedidos"
}

# 1) Frente 2: painel de conversas + correção do build do site (tsconfig)
Run @("add", "-A", "--", ".", ":!app.zip", ":!components.zip", ":!lib.zip", ":!prisma.zip", ":!services.zip", ":!commit-frentes.ps1")
Run @("commit", "-m", "Painel de conversas do WhatsApp e exclui tests do type-check do Next", "-m", "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>")

# 2) Frente 1: leva só a correção do build (tsconfig) para a branch da Frente 1
Run @("checkout", "frente-1-sessao-whatsapp")
Run @("checkout", "frente-2-agente-pedidos", "--", "tsconfig.json")
Run @("commit", "-m", "Exclui tests do type-check do Next (teste importava codigo do bot com pg)", "-m", "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>")
Run @("checkout", "frente-2-agente-pedidos")

Write-Host "Pronto. Commits feitos nas duas branches. Agora é só dar push:" -ForegroundColor Green
Write-Host "  git push origin frente-1-sessao-whatsapp frente-2-agente-pedidos"
git log --oneline -3
