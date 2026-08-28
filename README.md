# Doc Harmony

Crie uma aplicação para comparar os relatórios de NFS, NFE e CTE. É preciso ter uma árvore de opções antes de chegar na tela de consulta:

Qual o tipo de movimentação?

Entrada

Saída

Qual o tipo de documento?

Se entrada: NFE, CTE e NFSe

Se saída: NFE, NFCe e NFSe

Na tela de comparação, o usuário vai importar os arquivos da empresa: relatório do Jettax (Excel), o relatório do portal nacional (Excel) e comparar esses 2 arquivos com o relatório do Dominio (PDF).

Serão feitas 2 comparações a primeiro momento:

Quantidade de Notas:

Conte a quantidade de notas (Verifique separadamente em cada arquivo do cliente (jettax e portal nacional) e, depois, verifique entre eles para eliminar uma possível duplicidade) e compare com a quantidade de notas no relatório da Dominio. O número das notas nas planilhas do Jettax ficam nas colunas:

Entrada NFE: D

Entrada CTE: C

Entrada NFSe: A

Saída NFE: D

Saída NFCe: D

Saída NFSe: A

No PDF do domínio, ela fica na coluna "Nota".

Valor contábil:

Cada nota possui um valor contábil. É preciso somar todos os valores contábeis das duas planilhas da empresa (sempre validando entre elas para não ter nota duplicada). Nas planilhas do Jettax, os valores contábeis ficam nas colunas:

Entrada NFE: T

Entrada CTE: BI

Entrada NFS: L

Saída NFE: T

Saída NFC: T

Saída NFS: L

No PDF do domínio, ele fica na coluna "Valor Contábil".

Observação: O usuário pode adicionar a planilha do jettax ou do portal nacional, não é obrigatório por as duas, porém, caso tenha as duas, deve ser feita a comparação entre elas para eliminar as duplicidades.

O tema da aplicação deve ser cinza como principal e amarelo nos detalhes.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://fiscocheck.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bca12131-bc9d-4f95-944a-e5899b34e53a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
