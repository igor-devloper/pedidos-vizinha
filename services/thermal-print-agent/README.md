# Agente de impressao termica Vizinha

Este agente roda no computador, mini PC ou Raspberry que fica fisicamente ligado na impressora USB.

Fluxo:

```txt
Site -> Railway /print-jobs -> este agente local -> USB/driver -> impressora
```

## 1. Instale a impressora no computador local

No Windows:

1. Ligue a Knup KP-IM607 na tomada.
2. Coloque bobina termica 58 mm.
3. Conecte a impressora no USB.
4. Instale o driver da impressora, se o Windows nao reconhecer sozinho.
5. Va em `Configuracoes > Bluetooth e dispositivos > Impressoras e scanners`.
6. Abra a impressora e clique em `Imprimir pagina de teste`.

Se a pagina de teste nao sair, resolva isso antes de usar o agente.

## 2. Descubra o nome da impressora

No PowerShell:

```powershell
Get-Printer | Select-Object Name
```

Copie o nome exato. Exemplo:

```txt
KNUP KP-IM607
```

## 3. Configure o agente

Entre nesta pasta:

```powershell
cd services\thermal-print-agent
```

Instale as dependencias:

```powershell
npm.cmd install
```

Crie o arquivo `.env` copiando o exemplo:

```powershell
Copy-Item .env.example .env
```

Edite `.env`:

```env
PRINT_SERVICE_URL=https://sua-url-publica-do-railway.up.railway.app
PRINT_SERVICE_API_KEY=sua-chave
PRINTER_NAME=KNUP KP-IM607
POLL_INTERVAL_MS=5000
PRINTED_STATE_FILE=./data/printed-jobs.json
```

Use a URL publica do Railway, nao a URL `.railway.internal`.

## 4. Rode o agente

```powershell
npm.cmd run dev
```

Ele vai mostrar:

```txt
Vizinha thermal print agent started
Print service: https://...
Printer: KNUP KP-IM607
```

Agora clique em `Imprimir` em um pedido no painel `/manhia`.

## 5. Deixe rodando sempre

Para producao, rode:

```powershell
npm.cmd run build
npm.cmd run start
```

O ideal e configurar esse comando para iniciar junto com o Windows usando o Agendador de Tarefas.

## 6. Se nao imprimir

Confira nesta ordem:

1. A impressora imprime pagina de teste no Windows?
2. O `PRINTER_NAME` esta igual ao resultado de `Get-Printer`?
3. `PRINT_SERVICE_URL` e a URL publica do Railway?
4. `PRINT_SERVICE_API_KEY` e igual ao `BOT_API_KEY`/chave configurada no Railway?
5. O painel esta enviando jobs? Teste:

```powershell
curl.exe https://sua-url-publica-do-railway.up.railway.app/print-jobs -H "Authorization: Bearer sua-chave"
```

## Comando personalizado

Por padrao, no Windows o agente usa:

```powershell
Get-Content -Raw arquivo.txt | Out-Printer -Name "NOME_DA_IMPRESSORA"
```

Se o driver da Knup exigir outro comando, configure:

```env
PRINT_COMMAND=powershell -NoProfile -Command "Get-Content -Raw '{file}' | Out-Printer -Name '{printer}'"
```

O agente substitui:

- `{file}` pelo caminho do recibo temporario.
- `{printer}` pelo valor de `PRINTER_NAME`.
