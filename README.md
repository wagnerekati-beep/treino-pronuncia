# Treino de Pronúncia — Inglês Técnico

Treino diário de pronúncia de inglês técnico, com foco na **sílaba tônica**. 36 termos do dia a dia de Advisory, consultoria, processos e IA.

Feito para **Android com Chrome**. É o único aparelho que o app precisa atender.

---

## Instalar no celular

1. Abra o endereço do app no **Chrome do Android**.
2. Vá em **Ajustes**, lá embaixo na barra do app.
3. Toque em **Instalar app**.
4. Confirme.

Pronto: o app fica na tela inicial e abre sem a barra do navegador.

Se o botão **Instalar app** não aparecer, é porque o Chrome ainda não ofereceu a instalação. Use o app um pouco e volte em Ajustes; o botão aparece quando o Chrome libera.

---

## Se o app disser que não tem voz em inglês

O app usa a voz do próprio celular para falar. Se o seu Android não tem a voz de inglês instalada, ele avisa e mostra o caminho. É esse aqui:

1. **Configurações**
2. **Sistema**
3. **Idiomas e entrada**
4. **Saída de texto para voz**
5. **Google Fala** (ou o motor que estiver em uso)
6. Toque na **engrenagem** ao lado
7. **Instalar dados de voz**
8. **Inglês dos Estados Unidos**

Depois de instalar, feche o app e abra de novo.

Em **Ajustes** dá para escolher qual voz usar. A qualidade muda bastante de uma para outra — vale testar algumas e ficar com a melhor.

---

## Como treinar

A tela **Hoje** monta uma sessão de 10 cartões por dia, priorizando o que você errou.

1. O cartão abre mostrando só o termo. Tente falar em voz alta antes de qualquer ajuda.
2. **Ouvir** — o celular fala o termo em inglês.
3. **Devagar** — repete mais lento. A velocidade se ajusta em Ajustes.
4. Aí aparecem a sílaba tônica destacada, o erro comum do brasileiro e a frase de exemplo.
5. **Ouvir a frase** — fala a frase de exemplo em inglês.
6. **Gravar** — grava você falando (5 segundos no máximo) e toca sozinho: primeiro o celular, depois você. É a comparação que mostra se a força caiu na sílaba certa.
7. **Conferir** — opcional. Confere se a palavra saiu inteligível.
8. **Acertei** ou **Preciso repetir** — é o que alimenta a repetição.

As outras telas: **Termos** é a lista completa, filtrável, para consultar antes de uma reunião. **Progresso** mostra o que você domina e o que ainda erra. **Ajustes** tem voz, velocidade e instalação.

### O que o Conferir faz e o que não faz

O **Conferir** diz se a palavra saiu inteligível para o reconhecimento de fala do Google. Ele **não** avalia se a sílaba tônica está certa e não dá nota de sotaque.

Para tônica, o critério é a comparação A/B do botão **Gravar**: ouvir a voz do celular e a sua em sequência.

O Conferir precisa de internet. Quando você está offline, o botão simplesmente não aparece — o resto do app continua funcionando normalmente, inclusive o áudio.

---

## Repetição espaçada

Sistema Leitner, três caixas:

| Situação | O que acontece |
|---|---|
| Termo novo | entra na caixa 1 |
| Acertei | sobe uma caixa |
| Preciso repetir | volta para a caixa 1 e reaparece amanhã |

Caixa 1 volta em 1 dia, caixa 2 em 3 dias, caixa 3 em 7 dias. A sessão do dia monta 10 cartões: primeiro os vencidos, depois os novos.

Tudo fica guardado no próprio celular. Não tem cadastro, login nem nuvem.

---

## Para mexer no projeto

Arquivos: `index.html`, `app.js`, `styles.css`, `terms.json`, `manifest.json`, `sw.js`. HTML, CSS e JavaScript puros — sem framework, sem build, sem `npm install`.

Para testar no computador (microfone só funciona em `https` ou `localhost`):

```bash
node dev-server.js
```

E abra `http://localhost:5173`.

`audio-test.html` é uma página de diagnóstico: vozes do aparelho, gravação e reconhecimento de fala, com registro do que acontece. Abra ela primeiro quando algo de áudio parecer errado.

Para publicar uma atualização, troque a `VERSAO` no topo do `sw.js`. Sem isso, o celular continua servindo a versão antiga do cache.

Para mudar termos, edite `terms.json`. O campo `stress` é o índice da sílaba tônica dentro de `syllables`, começando em zero; a sílaba tônica também vai em MAIÚSCULAS no array.
