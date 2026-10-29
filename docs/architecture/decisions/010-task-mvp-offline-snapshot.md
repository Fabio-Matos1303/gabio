# ADR-010: Snapshot local e lançamento do MVP de tarefas

- Status: aceito
- Data: 2026-10-28

O primeiro lançamento apresenta Tarefas e Ajustes. A flag pública VITE_TASKS_MVP
é habilitada por padrão; false reabilita a navegação completa somente no servidor
de desenvolvimento. Builds de produção mantêm Tarefas e Ajustes mesmo se a
variável estiver definida como false. A seção Google Agenda é acrescentada em
Ajustes pelo ADR-011 e pode ser ocultada com VITE_GOOGLE_CALENDAR_ENABLED=false;
sua ativação é controlada no servidor.
A flag controla apresentação e não altera autorização.

A última leitura autorizada de tarefas é guardada no armazenamento local do
navegador com chave por usuário e residência, schema estrito e validade de 24 horas.
Esse armazenamento contém dados pessoais, não é criptografado e depende da
proteção do dispositivo. Logout limpa snapshots; a troca de identidade usa uma chave independente.
O cache nunca cria uma sessão ou autoriza acesso sem contexto autenticado.
Uma remoção de acesso remota só é reconhecida quando há comunicação com o servidor;
a lista offline é sempre uma cópia histórica, não uma autorização atual.

Comandos pendentes são projetados sobre a lista somente para apresentação.
Cartões pendentes não aceitam novas ações até a sincronização. Uma conclusão
recorrente pendente não inventa a próxima ocorrência: ela vem do servidor.
Somente comandos explicitamente rejeitados por conflito podem ser descartados.
Erros de rede mantêm commandId para replay; não são oferecidos como canceláveis.
O PostgreSQL e o Command Gateway continuam como autoridade.

A persistência IndexedDB só resolve após o commit da transação, garantindo que
o envio posterior não se antecipe à gravação local. Atualizações do token não
remontam a residência; outros eventos revalidam identidade e contexto.

Reabrir a PWA sem rede ainda depende da resolução da sessão e do contexto
residencial; este incremento não implementa bootstrap offline.

## Recorte do lançamento em 2026-10-29

Por decisão do produto, o MVP exige internet. Bootstrap offline e melhorias de
cache deixam de bloquear lançamento e homologação. O código existente de fila
e snapshot é preservado; o gateway continua confirmando toda mutação no servidor.
A validação prioriza tarefas online, duas identidades, privacidade e PWA mobile.
