# WhatsApp Bot com Baileys para Railway

Este servico cria uma base de bot WhatsApp no estilo "instancia + QR + webhook", inspirado no fluxo operacional usado em paineis como o Sinapse.

## O que esta incluido

- API HTTP para criar, iniciar, parar e apagar instancias.
- QR Code em data URL para conectar o WhatsApp.
- Processamento inline das mensagens no proprio runtime da instancia.
- Webhook de saida para seu backend principal.
- Fila HTTP autenticada para jobs de impressao termica (`/print-jobs`).
- Persistencia da sessao no Postgres (ou em pasta, no dev local).
- Leitura dos fluxos visuais cadastrados no banco principal via `DATABASE_URL`.

## Estrutura

- `src/server.ts`: API principal.
- `src/instance-manager.ts`: lifecycle das conexoes Baileys.
- `src/instance-store.ts`: metadados das instancias em arquivo JSON.
- `src/message-pipeline.ts`: webhook + automacao no mesmo processo.

## Sessao do WhatsApp e deploys

- Com `DATABASE_URL`, a sessao (credenciais e chaves do Baileys) fica no Postgres (`wa_auth`),
  os dados das instancias em `wa_instance` e o lock de instancia unica em `wa_lock`.
  As tabelas sao criadas sozinhas no boot (e existe a migration equivalente no Prisma).
  Nao precisa de Volume. Sem `DATABASE_URL` (dev local) usa a pasta `AUTH_DIR`.
- Uma pasta de sessao antiga (`AUTH_DIR`) e importada para o banco uma unica vez.
- So um processo mantem o socket de cada instancia (lock com TTL de 30 s, renovado a cada 10 s).
  Durante um deploy a copia nova fica em `standby` e assume sozinha quando a antiga solta o lock.
- Reconexao com backoff exponencial (2 s ate 60 s) para qualquer motivo, exceto `loggedOut`.
  So `loggedOut` apaga a sessao. `connectionReplaced` cede a vez em vez de brigar pela conexao.
- `SIGTERM`/`SIGINT`: grava credenciais, solta o lock e fecha com `end()`. `logout()` so e chamado
  por `POST /instances/:id/logout` (botao "Desconectar WhatsApp" do painel).
- Instancias com `autoStart` sobem sozinhas no boot; so "Parar" no painel desliga isso.
- O start command e `node dist/server.js` (sem npm) para o app receber o SIGTERM.

## Observacoes importantes

1. `useMultiFileAuthState` so e usado sem banco (dev). Em producao o auth state e o do Postgres.
2. Para usar o CRUD visual de fluxos no bot, defina `DATABASE_URL` apontando para o mesmo Postgres do app Next.

## Pedidos e pagamento pelo WhatsApp

Configure `APP_URL=https://vizinhasalgateria.site` no bot para chamar o site correto.
Configure `INTERNAL_ORDER_API_KEY` com o mesmo segredo no ambiente do site e do bot.
Como alternativa, a `BOT_API_KEY` do bot deve corresponder à `BOT_SERVICE_API_KEY`
do site. As chaves não devem ser publicadas nem usar o prefixo `NEXT_PUBLIC_`.
Depois de alterar as variáveis, publique/reinicie os dois serviços.

O bot chama `POST /api/internal/whatsapp-orders` com `{ draftId, preview: true }`
para validar e calcular o resumo sem criar pedido ou cobrança. A confirmação
usa o mesmo endpoint sem preview. Um 401 indica divergência nas chaves entre
os ambientes, antes de chamar o Mercado Pago. Erros do provedor retornam 502
com `PAYMENT_PROVIDER_ERROR`; o pedido permanece disponível para nova tentativa.

O fluxo coleta produto e quantidades/tipos, data e horário, dados pessoais,
modalidade/endereço e pagamento. O resumo usa o cálculo do site. Após confirmar,
o Pix vai em mensagem separada e o cartão usa o checkout do pedido.

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

- expandir o CRUD visual para uma DSL de fluxos com condicoes e passos;
- adicionar observabilidade e retries de webhook.
