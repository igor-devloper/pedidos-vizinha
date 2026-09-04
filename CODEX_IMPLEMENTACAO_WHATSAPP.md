# VIZINHA SALGATERIA — IMPLEMENTAÇÃO COMPLETA

## OBJETIVO

Evoluir o sistema atual da Vizinha Salgateria para permitir:

1. Pedido pelo site normalmente.
2. Pedido completo pelo WhatsApp.
3. Gemini participando do fluxo conversacional.
4. Recuperação automática após 10 minutos quando cliente recebeu o site e não concluiu.
5. PIX pelo WhatsApp.
6. Cartão por checkout transparente via link.
7. Correção dos bugs existentes de:
   - quantidade;
   - pedidos desaparecendo;
   - falso pagamento;
   - links 404.

IMPORTANTE:

- NÃO criar um sistema paralelo de pedidos.
- SITE e WHATSAPP devem gerar o mesmo Order.
- Produto, preço, promoção, quantidade, horário, entrega e pagamento devem ser validados pelo backend.
- Gemini entende linguagem natural, mas NÃO é fonte de verdade.
- Banco e Mercado Pago são fontes de verdade.
- Não apagar dados existentes.
- Não alterar secrets.
- Não mostrar secrets em logs.
- Fazer alterações incrementais e mínimas.
- Não reauditar o projeto inteiro em cada etapa.
- Reutilizar arquitetura existente sempre que possível.

---

# ETAPA 1 — FINALIZAR CORREÇÃO DE QUANTIDADE

A implementação já foi iniciada.

Garantir uma regra canônica de quantidade.

Para produtos com sabores/tipos:

totalSelecionado =
SUM(selectedItems.quantidade)

Validar isso contra requestedUnits.

Corrigir inconsistências entre:
- quantity
- requestedUnits
- selectedItems
- totalUnidades
- minQuantity

Para quantidade exata:
totalSelecionado === requestedUnits

Para quantidade mínima:
requestedUnits >= minQuantity

Evitar race condition entre salvar selectedItems e finalizar checkout.

Antes de criar Order, backend deve reler Cart/CartItems e validar o estado persistido.

Casos obrigatórios:

25 + 25 + 25 + 25 = 100 => válido.

99 => inválido.

101 em produto EXATO 100 => inválido.

101 em produto MÍNIMO 100 => válido.

Mensagem de erro deve informar a diferença real, por exemplo:
"Você selecionou 95 de 100 unidades."

---

# ETAPA 2 — PEDIDOS NÃO PODEM SUMIR

Investigar apenas código relacionado a:

- Order
- Pedido
- OrderItem
- dashboard/painel
- delete
- deleteMany
- Prisma relations/onDelete
- filtros de status/data
- jobs/cleanup

Objetivo:

Nenhum pedido operacional pode ser fisicamente apagado.

Pedido cancelado permanece no banco e muda apenas de status.

Não confundir limpeza de Cart/CartItem com exclusão de Order.

Corrigir a causa real encontrada.

Garantir que:
- PENDING permanece;
- PAID permanece;
- CANCELLED permanece;
- histórico continua consultável.

Se necessário, adicionar auditoria simples de eventos do Order.

---

# ETAPA 3 — BLINDAR MERCADO PAGO

Problemas conhecidos:

- já ocorreu pedido marcado como PAGO sem pagamento real;
- alguns links de pagamento deram 404.

Regra principal:

Order só pode ficar PAID quando existir confirmação válida do Mercado Pago.

Nunca marcar PAID só porque:
- frontend retornou sucesso;
- token foi criado;
- cobrança foi criada;
- usuário voltou do checkout;
- preference foi criada.

Validar sempre que aplicável:

- paymentId
- status === approved
- external_reference
- valor esperado
- Order correto

Webhook deve ser idempotente.

PIX criado:
Order continua PENDING.

Webhook approved:
Order pode ir para PAID.

Webhook duplicado:
não repetir:
- atualização financeira;
- impressão;
- WhatsApp;
- qualquer outro efeito.

Pagamento rejeitado:
não marcar PAID e permitir nova tentativa.

Centralizar geração das URLs de checkout/saldo.

Evitar 404 causado por:
- APP_URL inconsistente;
- rota errada;
- id incorreto;
- externalReference confundido com Order id.

Se link for inválido, mostrar página controlada em vez de 404 bruto quando possível.

---

# ETAPA 4 — CRIAR MOTOR ÚNICO DE PEDIDOS

Extrair a lógica de criação de Order para um serviço reutilizável.

Pode ser algo como:

lib/order-creation-service.ts

ou equivalente compatível com arquitetura existente.

Esse serviço deve ser usado por SITE e WHATSAPP.

Entrada normalizada:

customerName
customerPhone
customerEmail
scheduledAt
fulfillmentType
deliveryAddress
deliveryNumber
deliveryNeighborhood
deliveryReference
items
paymentMethod
paymentPercentage
source

Responsabilidades:

- consultar Produto real;
- validar ativo;
- validar quantidade;
- validar sabores/tipos;
- validar promoção;
- validar horário;
- validar antecedência;
- validar disponibilidade;
- calcular subtotal;
- calcular entrega;
- calcular taxas;
- calcular total;
- criar Order;
- criar OrderItems;
- criar code/externalReference.

Adicionar origem do pedido:

SITE
WHATSAPP
ADMIN

Pedidos existentes devem usar SITE por default seguro.

SITE deve continuar funcionando sem mudança de UX.

---

# ETAPA 5 — DRAFT DE PEDIDO DO WHATSAPP

Reaproveitar services/whatsapp-bot.

Criar ou evoluir model existente para guardar estado da conversa.

Pode reutilizar BotLead/BotOrder se fizer sentido ou criar WhatsappOrderDraft.

Campos necessários conceitualmente:

id
instanceId
remoteJid
phone
customerName
customerEmail
stage/status
fulfillmentType
scheduledAt
deliveryStreet
deliveryNumber
deliveryNeighborhood
deliveryReference
paymentMethod
paymentPercentage
items Json
siteLinkSentAt
whatsappOfferDueAt
whatsappOfferSentAt
siteOrderDetectedAt
orderId
lastCustomerMessageAt
lastBotMessageAt
createdAt
updatedAt

Não armazenar:
- cartão;
- CVV;
- tokens;
- dados sensíveis.

Draft não é Order.

Order só nasce após confirmação final do cliente.

Garantir idempotência:
uma confirmação repetida não pode criar dois Orders.

---

# ETAPA 6 — GEMINI EM TODO O FLUXO

Hoje o prompt atual orienta cliente a comprar somente pelo site.

Remover essa limitação.

Gemini deve participar da conversa inteira para:

- entender intenção;
- extrair informações;
- responder dúvidas;
- decidir qual informação falta;
- interpretar linguagem natural.

Mas Gemini NÃO deve decidir:

- preço;
- promoção;
- taxa;
- disponibilidade;
- valor final;
- status de pagamento.

Sempre carregar dinamicamente do banco:

Produtos ativos:
- id
- slug
- nome
- descrição
- categoria
- preço
- desconto/promoção
- totalUnidades
- minQuantity
- allowsMultiple
- maxTiposSalgado
- sabores/tipos
- comboItens
- pagamento parcial
- antecedência
- regras de seleção

StoreSettings:
- dias de funcionamento
- horários
- regras de entrega
- taxas
- endereço de retirada
- regras de pagamento
- antecedência
- demais configurações relevantes

Também enviar:
- draft atual;
- últimas mensagens relevantes;
- data/hora America/Sao_Paulo.

Gemini deve retornar structured output.

Estrutura simples:

{
  "intent": "...",
  "action": "...",
  "reply": "...",
  "extracted": {}
}

Actions possíveis:

ANSWER_QUESTION
SEND_SITE
START_WHATSAPP_ORDER
SET_PRODUCT
SET_QUANTITY
SET_FLAVORS
SET_NAME
SET_EMAIL
SET_DATETIME
SET_FULFILLMENT
SET_ADDRESS
SET_PAYMENT
SHOW_SUMMARY
CONFIRM_ORDER
CANCEL_DRAFT
HANDOFF

Backend valida tudo antes de persistir.

---

# ETAPA 7 — REGRA DOS 10 MINUTOS

Fluxo:

Cliente demonstra intenção de encomendar.

Bot envia site.

Registrar:
siteLinkSentAt

Definir:
whatsappOfferDueAt = siteLinkSentAt + 10 minutos

Não usar setTimeout em memória.

Precisa sobreviver:
- restart;
- deploy;
- queda do bot.

Após 10 minutos:

normalizar telefone do WhatsApp.

Buscar Order recente associado ao mesmo telefone.

Se NÃO houver Order:
oferecer compra pelo WhatsApp.

Mensagem sugerida:

"Oi 😊 Vi que o pedido ainda não apareceu por aqui. Se você teve dificuldade no site, não tem problema: eu posso montar sua encomenda por aqui mesmo. Quer fazer pelo WhatsApp?"

Cancelar esse fluxo imediatamente quando:

- cliente já chega fazendo encomenda;
- cliente pergunta se pode pedir pelo WhatsApp;
- cliente diz que quer fazer por aqui;
- Order aparece pelo telefone;
- cliente diz que conseguiu finalizar;
- humano assume;
- cliente desiste.

Se Order for criada mesmo como PENDING:
não enviar a oferta.

Máximo uma oferta automática por intenção/draft.

---

# ETAPA 8 — COLETA DO PEDIDO NO WHATSAPP

Coletar somente o que falta.

Dados:

- produto;
- quantidade;
- sabores/tipos;
- nome;
- telefone automático;
- email;
- data;
- hora;
- retirada ou entrega;
- endereço completo se entrega;
- forma de pagamento;
- percentual de pagamento quando permitido.

Cliente pode enviar vários campos juntos.

Exemplo:

"Quero 100 fritos sábado às 10, 25 coxinha, 25 risole, 25 pastel e 25 bolinha. Vou buscar."

Extrair tudo possível e perguntar somente o que falta.

Não repetir pergunta já respondida.

DATA/HORA

Aceitar linguagem natural como:

"amanhã às 10"
"sábado"
"dia 8 às 14"

Gemini interpreta.

Backend converte para America/Sao_Paulo e valida.

Se ambíguo:
pedir confirmação.

ENTREGA

Se retirada:
usar endereço configurado da loja.

Se entrega:
coletar:
- rua
- número
- bairro
- complemento/referência se necessário

Taxa sempre calculada pelo backend.

PROMOÇÕES

Exemplo:
promoção de cento somente fritos.

Se cliente tentar usar opções incompatíveis:
explicar e oferecer alternativa correta.

Nunca inventar preço.

---

# ETAPA 9 — RESUMO E CONFIRMAÇÃO

Antes de criar Order enviar resumo completo:

- itens;
- quantidades;
- sabores;
- nome;
- data;
- horário;
- retirada/entrega;
- endereço;
- subtotal;
- taxa de entrega;
- outras taxas;
- total;
- valor a pagar agora;
- método.

Perguntar claramente se está correto.

Só criar Order após resposta afirmativa inequívoca.

Permitir correções antes da confirmação:

"troca para 11 horas"
"quero 50 coxinhas"
"vai ser entrega"
"muda o bairro"

Após alteração:
recalcular backend e mostrar novo resumo.

---

# ETAPA 10 — PIX PELO WHATSAPP

Depois que Order existir:

Criar cobrança PIX para esse Order.

Não criar novo pedido.

Enviar somente:

- número do pedido;
- valor;
- PIX copia e cola.

Não enviar base64.

Mensagem pode ser equivalente a:

"Seu pedido #XYZ foi criado 😊
Valor a pagar agora: R$ XX,XX

Pix copia e cola:
[código]

Assim que o pagamento for confirmado, eu aviso por aqui."

Order continua PENDING.

Aguardar webhook Mercado Pago.

approved:
- alterar status;
- registrar evento;
- avisar cliente;
- acionar fluxos normais já existentes.

---

# ETAPA 11 — CARTÃO PELO WHATSAPP

Nunca coletar cartão no WhatsApp.

Nunca enviar cartão para Gemini.

Para cartão:

gerar link seguro para checkout transparente da Vizinha.

O link deve abrir diretamente o Order já criado.

Cliente não precisa montar carrinho novamente.

Página consulta Order no backend.

Valor não deve vir confiável pela querystring.

Após pagamento:
usar o mesmo mecanismo seguro do Mercado Pago.

Se cliente enviar dados de cartão pelo WhatsApp:
orientar a não enviar e fornecer o checkout seguro.

---

# ETAPA 12 — PAGAMENTO PARCIAL / SALDO

Quando produto permitir 50%:

cliente pode escolher 50% ou 100%.

Se pagar 50%:
Order mantém saldo corretamente.

Quando pedido estiver pronto:
usar fluxo existente de pagamento do saldo.

Garantir que link de saldo use o checkout transparente corrigido.

---

# ETAPA 13 — PAINEL

Pedidos SITE e WHATSAPP devem aparecer juntos.

Order continua sendo a entidade oficial.

Adicionar badge de origem:

SITE
WHATSAPP
ADMIN

Quando útil, mostrar detalhes do atendimento:

- telefone;
- início;
- site enviado;
- follow-up 10 min;
- draft;
- quando virou Order;
- eventos.

Criar visualização de atendimentos WhatsApp com estados:

- em atendimento;
- aguardando cliente;
- aguardando pagamento;
- concluído;
- handoff;
- abandonado.

Se humano assumir:
bot para de responder automaticamente naquele atendimento.

---

# ETAPA 14 — TESTES ESSENCIAIS

Não criar dezenas de testes redundantes.

Cobrir pelo menos:

1. 25+25+25+25 = 100.
2. Quantidade inválida corretamente bloqueada.
3. Pedido PENDING não some.
4. Pedido PAID não some.
5. Pedido CANCELLED não some.
6. PIX pending não vira PAID.
7. approved vira PAID.
8. webhook duplicado não duplica efeitos.
9. external_reference errado não atualiza Order.
10. valor divergente não atualiza Order.
11. cliente recebeu site e não pediu por 10 min => oferece WhatsApp.
12. Order criada antes de 10 min => não oferece.
13. cliente pede WhatsApp diretamente => inicia na hora.
14. pedido completo em uma mensagem.
15. pedido passo a passo.
16. promoção incompatível corretamente tratada.
17. horário inválido corretamente tratado.
18. entrega calcula mesma taxa do site.
19. confirmação repetida não cria dois Orders.
20. restart não perde draft/prazo de follow-up.
21. cartão rejeitado não marca PAID.
22. pagamento parcial mantém saldo correto.

---

# ETAPA 15 — VALIDAÇÃO FINAL

Somente depois de terminar as alterações:

executar:
- testes relacionados;
- typecheck;
- build de produção.

Não gastar tempo corrigindo warnings antigos que não tenham relação com esta implementação.

Corrigir apenas regressões causadas pelas alterações atuais.

Ao final responder de forma curta:

1. etapas concluídas;
2. arquivos principais alterados;
3. migrations criadas;
4. testes executados;
5. build;
6. variáveis de ambiente novas, se houver;
7. pendências reais.

Não gerar documentação extensa.