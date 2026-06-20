# WhatsApp Bot com Baileys para Railway

Este servico cria uma base de bot WhatsApp no estilo "instancia + QR + webhook", inspirado no fluxo operacional usado em paineis como o Sinapse.

## O que esta incluido

- API HTTP para criar, iniciar, parar e apagar instancias.
- QR Code em data URL para conectar o WhatsApp.
- Processamento inline das mensagens no proprio runtime da instancia.
- Webhook de saida para seu backend principal.
- Fila HTTP autenticada para jobs de impressao termica (`/print-jobs`).
- Persistencia de credenciais por pasta, pronta para ser montada em Volume no Railway.
- Leitura dos fluxos visuais cadastrados no banco principal via `DATABASE_URL`.

## Estrutura

- `src/server.ts`: API principal.
- `src/instance-manager.ts`: lifecycle das conexoes Baileys.
- `src/instance-store.ts`: metadados das instancias em arquivo JSON.
- `src/message-pipeline.ts`: webhook + automacao no mesmo processo.

## Observacoes importantes

1. Este projeto usa `useMultiFileAuthState` por simplicidade operacional.
   A documentacao oficial do Baileys recomenda criar um auth state proprio para producao e avisa para nao usar esse helper como padrao de producao.
2. Em Railway, monte um Volume em `/app/data` para persistir `./data/auth` e `./data/instances.json`.
3. Para usar o CRUD visual de fluxos no bot, defina `DATABASE_URL` apontando para o mesmo Postgres do app Next.

## Endpoints principais

- `GET /health`
- `GET /instances`
- `POST /instances`
- `POST /instances/:id/start`
- `POST /instances/:id/stop`
- `DELETE /instances/:id`
- `GET /instances/:id/qr`
- `POST /instances/:id/send-text`
- `POST /print-jobs`
- `GET /print-jobs`

Todos os endpoints, exceto `/health`, exigem header:

```txt
Authorization: Bearer <BOT_API_KEY>
```

## Exemplo de criacao de instancia

```bash
curl -X POST http://localhost:8787/instances \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Atendimento Vizinha",
    "phoneNumber": "5583987137721",
    "webhookUrl": "https://seu-backend.com/webhooks/whatsapp"
  }'
```

## Exemplo de QR

Depois de criar e iniciar a instancia:

```bash
curl http://localhost:8787/instances/<INSTANCE_ID>/qr \
  -H "Authorization: Bearer change-me"
```

Isso devolve a string do QR e um `dataUrl` pronto para renderizar no frontend.

## Como subir no Railway

### Service 1: API

- Root Directory: `services/whatsapp-bot`
- Start Command: `npm run start`
- Mount Volume: `/app/data`
- Variaveis:
  - `BOT_API_KEY`
  - `DATABASE_URL`
  - `BASE_URL`
  - `WEBHOOK_URL` opcional
  - `INSTANCE_BOOT_IDS` opcional
  - `PRINT_JOBS_FILE` opcional, padrao `./data/print-jobs.ndjson`

## Impressora termica

O app principal envia os recibos para este servico usando:

- `PRINT_SERVICE_URL` ou `BOT_SERVICE_URL`/`BAILEYS_SERVICE_URL`
- `PRINT_SERVICE_API_KEY` ou `BOT_API_KEY`

A impressora Knup KP-IM607 da foto e ESC/POS 58 mm por USB. O Railway consegue receber e registrar o job, mas nao consegue acessar uma impressora USB local sozinho. Para imprimir fisicamente sem um PC com o painel aberto, conecte a impressora a um dispositivo sempre ligado no local (por exemplo um mini print server/Android/Raspberry Pi) que consuma `GET /print-jobs` e envie o texto para a USB/ESC-POS, ou use uma versao de impressora com interface de rede e um servico ponte na mesma rede.

## Railway e arquitetura

De acordo com a documentacao do Railway:

- Volumes ficam acessiveis no path montado e devem ser usados para dados persistentes do servico.
- Se a app grava em `./data`, o mount recomendado e `/app/data`.
- O bot pode rodar como um unico service always-on, sem fila externa, igual ao modelo mais simples de paines operacionais.

## Proximos passos recomendados

- trocar o store JSON por Postgres;
- trocar `useMultiFileAuthState` por auth state proprio em banco;
- expandir o CRUD visual para uma DSL de fluxos com condicoes e passos;
- adicionar observabilidade e retries de webhook.
