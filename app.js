/* Treino de Pronúncia — inglês técnico, foco na sílaba tônica.
   Alvo único: Chrome no Android. Sem framework, sem build, sem rede depois de carregar. */
(function () {
  'use strict';

  var VERSAO = '1.0.0';
  var TAM_SESSAO = 10;
  var LIMITE_GRAVACAO_MS = 5000;
  var INTERVALOS = { 1: 1, 2: 3, 3: 7 }; // caixa -> dias até voltar
  var ROTULO_CAT = { cargo: 'Cargo e área', consultoria: 'Consultoria', processos: 'Processos', ia: 'IA' };

  var TERMOS = [];
  var sessao = [];          // termos da sessão corrente
  var indice = 0;           // posição na sessão
  var modoConsulta = false; // cartão aberto pela lista, só para consultar
  var feitosHoje = {};      // ids já respondidos nesta abertura do app
  var telaAtual = 'hoje';
  var vozFalhou = false;    // aparelho sem voz em inglês: esconde os botões de áudio
  var filtroCat = 'todos';

  /* =========================================================
     Armazenamento — nunca pode derrubar o app
     ========================================================= */
  var Guardar = {
    ler: function (chave, padrao) {
      try {
        var cru = localStorage.getItem(chave);
        return cru ? JSON.parse(cru) : padrao;
      } catch (e) { return padrao; }
    },
    gravar: function (chave, valor) {
      try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
      catch (e) { return false; }
    },
    apagar: function (chave) {
      try { localStorage.removeItem(chave); } catch (e) { /* ignora */ }
    }
  };

  var K_PROG = 'pronuncia.progresso.v1';
  var K_AJU = 'pronuncia.ajustes.v1';
  var K_SEQ = 'pronuncia.sequencia.v1';

  var ajustes = Object.assign(
    { voz: '', lento: 0.6, gravar: true, telaAcesa: true },
    Guardar.ler(K_AJU, {})
  );
  function salvarAjustes() { Guardar.gravar(K_AJU, ajustes); }

  /* =========================================================
     Datas
     ========================================================= */
  function diaStr(d) {
    var x = d || new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  function maisDias(n) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return diaStr(d);
  }

  /* =========================================================
     Leitner — 3 caixas
     ========================================================= */
  var Leitner = {
    tudo: function () { return Guardar.ler(K_PROG, {}); },
    de: function (id) { return this.tudo()[id] || null; },
    registrar: function (id, acertou) {
      var prog = this.tudo();
      var atual = prog[id] || { caixa: 1, acertos: 0, erros: 0 };
      if (acertou) {
        atual.caixa = Math.min(3, (atual.caixa || 1) + 1);
        atual.acertos = (atual.acertos || 0) + 1;
        atual.vence = maisDias(INTERVALOS[atual.caixa]);
      } else {
        atual.caixa = 1;
        atual.erros = (atual.erros || 0) + 1;
        atual.vence = maisDias(1); // volta na sessão de amanhã
      }
      atual.visto = diaStr();
      prog[id] = atual;
      Guardar.gravar(K_PROG, prog);
      this.marcarDia();
      return atual;
    },
    marcarDia: function () {
      var s = Guardar.ler(K_SEQ, { ultimo: '', seguidos: 0, total: 0 });
      var hoje = diaStr();
      if (s.ultimo === hoje) return;
      s.seguidos = (s.ultimo === maisDias(-1)) ? (s.seguidos || 0) + 1 : 1;
      s.ultimo = hoje;
      s.total = (s.total || 0) + 1;
      Guardar.gravar(K_SEQ, s);
    },
    sequencia: function () { return Guardar.ler(K_SEQ, { ultimo: '', seguidos: 0, total: 0 }); },
    zerar: function () { Guardar.apagar(K_PROG); Guardar.apagar(K_SEQ); }
  };

  function montarSessao(tamanho) {
    var prog = Leitner.tudo();
    var hoje = diaStr();
    var vencidos = TERMOS.filter(function (t) {
      var p = prog[t.id];
      return p && p.vence && p.vence <= hoje && !feitosHoje[t.id];
    }).sort(function (a, b) {
      var pa = prog[a.id], pb = prog[b.id];
      return (pa.caixa - pb.caixa) || (pa.vence < pb.vence ? -1 : 1);
    });
    var novos = TERMOS.filter(function (t) { return !prog[t.id] && !feitosHoje[t.id]; });
    return vencidos.concat(novos).slice(0, tamanho);
  }

  function montarExtra(tamanho) {
    var prog = Leitner.tudo();
    return TERMOS.filter(function (t) { return !feitosHoje[t.id]; })
      .sort(function (a, b) {
        var ca = (prog[a.id] && prog[a.id].caixa) || 1;
        var cb = (prog[b.id] && prog[b.id].caixa) || 1;
        return ca - cb;
      })
      .slice(0, tamanho);
  }

  /* =========================================================
     Voz do aparelho
     ========================================================= */
  var Voz = {
    synth: window.speechSynthesis || null,
    lista: [],
    atual: null,
    pronta: false,
    tentativas: 0,
    keepAlive: null,
    aoFicarPronta: [],

    iniciar: function () {
      var self = this;
      if (!this.synth) { this.falhou('Este navegador não tem síntese de voz.'); return; }
      if (this.synth.addEventListener) {
        this.synth.addEventListener('voiceschanged', function () { self.carregar(); });
      }
      this.carregar();
    },

    // getVoices() volta vazio na primeira chamada no Chrome Android. Insiste até chegar.
    carregar: function () {
      if (this.pronta) return;
      var self = this;
      var todas = this.synth.getVoices() || [];
      if (!todas.length) {
        this.tentativas++;
        if (this.tentativas < 32) { setTimeout(function () { self.carregar(); }, 250); }
        else { this.falhou('Nenhuma voz encontrada neste aparelho.'); }
        return;
      }
      var ingles = todas.filter(function (v) { return /^en/i.test(v.lang || ''); });
      if (!ingles.length) { this.falhou('Nenhuma voz em inglês instalada.'); return; }

      this.lista = ingles;
      this.atual = this.escolherVoz(ingles);
      this.pronta = true;
      this.aoFicarPronta.forEach(function (fn) { try { fn(); } catch (e) { /* ignora */ } });
      this.aoFicarPronta = [];
    },

    escolherVoz: function (lista) {
      var salva = lista.filter(function (v) { return v.name === ajustes.voz; })[0];
      if (salva) return salva;
      var us = lista.filter(function (v) { return /^en[-_]us/i.test(v.lang); });
      var pool = us.length ? us : lista;
      var google = pool.filter(function (v) { return /google/i.test(v.name || ''); });
      return google[0] || pool[0];
    },

    falhou: function (motivo) {
      this.pronta = false;
      this.motivo = motivo;
      UI.semVoz(motivo);
    },

    usar: function (nome) {
      var v = this.lista.filter(function (x) { return x.name === nome; })[0];
      if (!v) return;
      this.atual = v;
      ajustes.voz = nome;
      salvarAjustes();
    },

    // Fala e devolve uma promessa que fecha no fim, com rede de segurança por tempo.
    falar: function (texto, rate) {
      var self = this;
      return new Promise(function (resolve) {
        if (!self.synth || !self.atual) { resolve(false); return; }
        self.parar();
        setTimeout(function () {
          var u = new SpeechSynthesisUtterance(texto);
          u.voice = self.atual;
          u.lang = self.atual.lang;
          u.rate = rate || 1;
          u.pitch = 1;
          u.volume = 1;

          var fechado = false;
          var guarda = null;
          function fechar(ok) {
            if (fechado) return;
            fechado = true;
            clearTimeout(guarda);
            clearInterval(self.keepAlive);
            self.keepAlive = null;
            resolve(ok);
          }

          u.onstart = function () {
            // Bug do Chrome Android: a fala trava depois de alguns segundos.
            clearInterval(self.keepAlive);
            self.keepAlive = setInterval(function () {
              if (!self.synth.speaking) { clearInterval(self.keepAlive); self.keepAlive = null; return; }
              self.synth.pause();
              self.synth.resume();
            }, 5000);
          };
          u.onend = function () { fechar(true); };
          u.onerror = function () { fechar(false); };

          // se onend não vier (acontece no Android), libera a sequência mesmo assim
          var estimativa = Math.max(3000, 1400 + texto.length * 95 / (rate || 1));
          guarda = setTimeout(function () { fechar(true); }, estimativa);

          self.synth.speak(u);
        }, 60);
      });
    },

    parar: function () {
      clearInterval(this.keepAlive);
      this.keepAlive = null;
      if (this.synth) { try { this.synth.cancel(); } catch (e) { /* ignora */ } }
    }
  };

  /* =========================================================
     Gravação e comparação A/B
     ========================================================= */
  var Gravador = {
    suportado: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder),
    rec: null,
    stream: null,
    corte: null,
    url: null,
    tocador: new Audio(),
    gravando: false,

    comecar: function (aoTerminar, aoFalhar) {
      var self = this;
      if (!this.suportado) { aoFalhar('Este navegador não grava áudio. Use o Chrome, em uma página https.'); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        self.stream = stream;
        var mime = 'audio/webm;codecs=opus';
        var opcoes = (window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) ? { mimeType: mime } : undefined;
        try { self.rec = opcoes ? new MediaRecorder(stream, opcoes) : new MediaRecorder(stream); }
        catch (e) { self.liberar(); aoFalhar('Não consegui iniciar a gravação neste aparelho.'); return; }

        var pedacos = [];
        self.rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) pedacos.push(ev.data); };
        self.rec.onerror = function () { self.liberar(); aoFalhar('A gravação falhou no meio.'); };
        self.rec.onstop = function () {
          clearTimeout(self.corte);
          self.gravando = false;
          self.liberar(); // apaga o indicador de microfone do Android
          if (self.url) { URL.revokeObjectURL(self.url); self.url = null; }
          var blob = new Blob(pedacos, { type: (self.rec && self.rec.mimeType) || 'audio/webm' });
          if (!blob.size) { aoFalhar('Não saiu som. Fale mais perto do microfone.'); return; }
          self.url = URL.createObjectURL(blob);
          aoTerminar();
        };
        self.rec.start();
        self.gravando = true;
        self.corte = setTimeout(function () { self.parar(); }, LIMITE_GRAVACAO_MS);
      }).catch(function (err) {
        var msg = (err && err.name === 'NotAllowedError')
          ? 'Permissão de microfone negada. Libere o microfone nas permissões do site e tente de novo.'
          : 'Não consegui acessar o microfone.';
        aoFalhar(msg);
      });
    },

    parar: function () {
      clearTimeout(this.corte);
      if (this.rec && this.rec.state === 'recording') { try { this.rec.stop(); } catch (e) { /* ignora */ } }
      else { this.gravando = false; this.liberar(); }
    },

    liberar: function () {
      if (this.stream) {
        this.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* ignora */ } });
        this.stream = null;
      }
    },

    tocar: function () {
      var self = this;
      return new Promise(function (resolve) {
        if (!self.url) { resolve(false); return; }
        self.tocador.src = self.url;
        self.tocador.onended = function () { resolve(true); };
        self.tocador.onerror = function () { resolve(false); };
        var p = self.tocador.play();
        if (p && p.catch) p.catch(function () { resolve(false); });
      });
    },

    descartar: function () {
      this.parar();
      try { this.tocador.pause(); } catch (e) { /* ignora */ }
      if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    },

    temGravacao: function () { return !!this.url; }
  };

  /* =========================================================
     Conferir — reconhecimento de fala (camada opcional)
     ========================================================= */
  var Conferencia = {
    Motor: window.SpeechRecognition || window.webkitSpeechRecognition || null,
    ativo: null,
    disponivel: function () { return !!this.Motor && navigator.onLine !== false; },

    normalizar: function (s) {
      var t = String(s || '').toLowerCase();
      if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    },

    ouvir: function (termo, aoResultado, aoFalhar) {
      var self = this;
      if (!this.Motor) { aoFalhar('Este navegador não reconhece fala.'); return; }
      this.cancelar();
      var r = new this.Motor();
      r.lang = 'en-US';
      r.continuous = false;
      r.interimResults = false;
      r.maxAlternatives = 3;

      var respondeu = false;
      r.onresult = function (ev) {
        respondeu = true;
        var alts = [];
        for (var i = 0; i < ev.results[0].length; i++) alts.push(ev.results[0][i].transcript);
        var alvos = [termo.speak, termo.term].map(function (x) { return self.normalizar(x); });
        var acertou = alts.some(function (a) { return alvos.indexOf(self.normalizar(a)) !== -1; });
        aoResultado(acertou, alts[0]);
      };
      r.onerror = function (ev) {
        respondeu = true;
        var e = ev && ev.error;
        if (e === 'no-speech') aoFalhar('Não ouvi nada. Toque de novo e fale logo em seguida.');
        else if (e === 'not-allowed' || e === 'service-not-allowed') aoFalhar('Permissão de microfone negada.');
        else if (e === 'network') aoFalhar('O Conferir precisa de internet.');
        else aoFalhar('Não consegui ouvir agora.');
      };
      r.onend = function () {
        self.ativo = null;
        if (!respondeu) aoFalhar('Não ouvi nada. Toque de novo e fale logo em seguida.');
      };
      this.ativo = r;
      try { r.start(); } catch (e) { aoFalhar('Não consegui iniciar o reconhecimento.'); }
    },

    cancelar: function () {
      if (this.ativo) { try { this.ativo.abort(); } catch (e) { /* ignora */ } this.ativo = null; }
    }
  };

  /* =========================================================
     Tela acesa
     ========================================================= */
  var Tela = {
    lock: null,
    pedir: function () {
      if (!ajustes.telaAcesa || !navigator.wakeLock || this.lock) return;
      var self = this;
      navigator.wakeLock.request('screen').then(function (l) {
        self.lock = l;
        l.addEventListener('release', function () { self.lock = null; });
      }).catch(function () { /* sem drama: só não mantém acesa */ });
    },
    soltar: function () {
      if (this.lock) { try { this.lock.release(); } catch (e) { /* ignora */ } this.lock = null; }
    }
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && telaAtual === 'hoje') Tela.pedir();
    else Tela.soltar();
  });

  /* =========================================================
     Interface
     ========================================================= */
  var el = {};
  ['tituloTela', 'contador', 'barraProgresso', 'avisoGlobal', 'semVoz', 'fimSessao', 'resumoSessao',
    'numerosFim', 'btnTreinarMais', 'areaCartao', 'cartao', 'cSigla', 'cTermo', 'cCategoria', 'cRevelado',
    'cSilabas', 'cDicaForte', 'cErro', 'cFraseEn', 'cFrasePt', 'btnFrase', 'cNota', 'estadoGravando', 'textoGravando',
    'avisoCartao', 'acoes', 'btnOuvir', 'btnDevagar', 'btnGravar', 'btnConferir', 'btnAcertei', 'btnRepetir',
    'filtros', 'listaTermos', 'numeros', 'listaErrados', 'listaDominados', 'btnZerar', 'selVoz', 'ajudaVoz',
    'btnTestarVoz', 'rangeLento', 'valorLento', 'chkGravar', 'chkTela', 'btnInstalar', 'ajudaInstalar',
    'infoVersao'].forEach(function (id) { el[id] = document.getElementById(id); });

  var UI = {
    aviso: function (alvo, texto, tipo) {
      var n = (alvo === 'cartao') ? el.avisoCartao : el.avisoGlobal;
      if (!n) return;
      if (!texto) { n.hidden = true; n.textContent = ''; return; }
      n.className = 'aviso' + (tipo ? ' ' + tipo : '');
      n.innerHTML = texto;
      n.hidden = false;
    },

    // Sem voz em inglês o app não fala, mas continua servindo para ver a tônica e treinar.
    semVoz: function () {
      vozFalhou = true;
      if (el.semVoz) el.semVoz.hidden = false;
      el.btnOuvir.hidden = true;
      el.btnDevagar.hidden = true;
      el.btnGravar.hidden = true;
      UI.revelar();
      UI.atualizarAcoes();
    },

    vozPronta: function () {
      vozFalhou = false;
      if (el.semVoz) el.semVoz.hidden = true;
      el.btnOuvir.hidden = false;
      el.btnDevagar.hidden = false;
      el.btnOuvir.disabled = false;
      el.btnDevagar.disabled = false;
      UI.atualizarAcoes();
      if (Voz.atual && !/^en[-_]us/i.test(Voz.atual.lang)) {
        UI.aviso('global', 'Sem voz en-US neste aparelho. Usando <em>' + Voz.atual.lang + '</em>.', 'destaque');
      }
      UI.montarSelectVoz();
    },

    montarSelectVoz: function () {
      if (!el.selVoz) return;
      el.selVoz.innerHTML = '';
      if (!Voz.lista.length) {
        var o = document.createElement('option');
        o.textContent = 'nenhuma voz em inglês';
        el.selVoz.appendChild(o);
        el.selVoz.disabled = true;
        return;
      }
      Voz.lista.forEach(function (v) {
        var op = document.createElement('option');
        op.value = v.name;
        op.textContent = v.name + ' — ' + v.lang + (v.localService ? '' : ' (usa rede)');
        if (Voz.atual && v.name === Voz.atual.name) op.selected = true;
        el.selVoz.appendChild(op);
      });
      el.selVoz.disabled = false;
    },

    trocarTela: function (nome) {
      telaAtual = nome;
      ['hoje', 'todos', 'progresso', 'ajustes'].forEach(function (t) {
        var n = document.getElementById('tela-' + t);
        if (n) n.hidden = (t !== nome);
      });
      document.querySelectorAll('.nav button').forEach(function (b) {
        if (b.dataset.tela === nome) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
      el.tituloTela.textContent = { hoje: 'Hoje', todos: 'Todos os termos', progresso: 'Progresso', ajustes: 'Ajustes' }[nome];
      UI.atualizarAcoes();
      if (nome === 'hoje') { Tela.pedir(); } else { Tela.soltar(); Voz.parar(); Gravador.parar(); Conferencia.cancelar(); }
      if (nome === 'progresso') UI.desenharProgresso();
      if (nome === 'todos') UI.desenharLista();
      UI.atualizarContador();
      var visivel = document.querySelector('.tela:not([hidden])');
      if (visivel) visivel.scrollTop = 0;
    },

    // A barra de botões só existe na tela Hoje, com um cartão aberto. Linhas vazias somem.
    atualizarAcoes: function () {
      el.acoes.hidden = !(telaAtual === 'hoje' && sessao.length > 0 && el.fimSessao.hidden);
      var linhaAudio = el.btnOuvir.parentNode;
      if (linhaAudio) linhaAudio.hidden = (el.btnOuvir.hidden && el.btnDevagar.hidden);
      var linhaMic = el.btnGravar.parentNode;
      if (linhaMic) linhaMic.hidden = (el.btnGravar.hidden && el.btnConferir.hidden);
    },

    atualizarContador: function () {
      if (telaAtual !== 'hoje' || !sessao.length || !el.fimSessao.hidden) {
        el.contador.textContent = '';
        el.barraProgresso.style.width = '0%';
        return;
      }
      if (modoConsulta) {
        el.contador.textContent = 'consulta';
        el.barraProgresso.style.width = '100%';
        return;
      }
      el.contador.textContent = (indice + 1) + ' de ' + sessao.length;
      el.barraProgresso.style.width = Math.round((indice / sessao.length) * 100) + '%';
    },

    silabasHTML: function (t) {
      return t.syllables.map(function (s, i) {
        var forte = (i === t.stress) || (s === s.toUpperCase() && /[A-Z]/.test(s));
        return '<span class="sil' + (forte ? ' forte' : '') + '">' + escapar(s) + '</span>' +
          (i < t.syllables.length - 1 ? '<span class="sep">-</span>' : '');
      }).join('');
    },

    desenharCartao: function () {
      var t = sessao[indice];
      if (!t) return;
      Gravador.descartar();
      Conferencia.cancelar();
      Voz.parar();

      el.cSigla.hidden = !t.sigla;
      el.cSigla.textContent = t.sigla || '';
      el.cTermo.textContent = t.term;
      el.cCategoria.textContent = ROTULO_CAT[t.category] || t.category;

      el.cSilabas.innerHTML = UI.silabasHTML(t);
      var forteTxt = t.syllables[t.stress];
      el.cDicaForte.textContent = 'A força cai em ' + forteTxt + '.';
      el.cErro.textContent = t.error;
      el.cFraseEn.textContent = t.enPhrase;
      el.cFrasePt.textContent = t.ptSentence;
      el.cNota.textContent = t.note;

      el.cRevelado.hidden = !(modoConsulta || vozFalhou);
      el.estadoGravando.hidden = true;
      el.btnGravar.innerHTML = '<span class="ic" aria-hidden="true">🎙️</span> Gravar';
      el.btnGravar.classList.remove('grav');
      UI.aviso('cartao', '');

      el.btnGravar.hidden = !(ajustes.gravar && Gravador.suportado) || vozFalhou;
      el.btnFrase.hidden = vozFalhou;
      el.btnConferir.hidden = !Conferencia.disponivel();

      var linhaFinal = el.btnAcertei.parentNode;
      if (modoConsulta) {
        el.btnAcertei.hidden = true;
        el.btnRepetir.hidden = true;
        if (!document.getElementById('btnVoltarLista')) {
          var b = document.createElement('button');
          b.className = 'btn';
          b.id = 'btnVoltarLista';
          b.type = 'button';
          b.textContent = 'Voltar aos termos';
          b.style.gridColumn = '1 / -1';
          b.onclick = function () { modoConsulta = false; sessao = []; UI.trocarTela('todos'); iniciarDia(); };
          linhaFinal.appendChild(b);
        }
      } else {
        el.btnAcertei.hidden = false;
        el.btnRepetir.hidden = false;
        var antigo = document.getElementById('btnVoltarLista');
        if (antigo) antigo.remove();
      }

      el.cartao.scrollIntoView({ block: 'start' });
      UI.atualizarAcoes();
      UI.atualizarContador();
    },

    revelar: function () {
      if (el.cRevelado.hidden) el.cRevelado.hidden = false;
    },

    desenharLista: function () {
      var prog = Leitner.tudo();
      if (!el.filtros.childNodes.length) {
        [['todos', 'Todos'], ['cargo', 'Cargo'], ['consultoria', 'Consultoria'], ['processos', 'Processos'], ['ia', 'IA']]
          .forEach(function (par) {
            var c = document.createElement('button');
            c.type = 'button';
            c.className = 'chip';
            c.textContent = par[1];
            c.dataset.cat = par[0];
            c.setAttribute('aria-pressed', String(par[0] === filtroCat));
            c.onclick = function () { filtroCat = par[0]; UI.desenharLista(); };
            el.filtros.appendChild(c);
          });
        var treinar = document.createElement('button');
        treinar.type = 'button';
        treinar.className = 'btn peq';
        treinar.id = 'btnTreinarCat';
        treinar.style.width = '100%';
        treinar.onclick = function () { treinarCategoria(filtroCat); };
        el.filtros.parentNode.insertBefore(treinar, el.listaTermos);
      }
      el.filtros.querySelectorAll('.chip').forEach(function (c) {
        c.setAttribute('aria-pressed', String(c.dataset.cat === filtroCat));
      });
      var bt = document.getElementById('btnTreinarCat');
      if (bt) bt.textContent = filtroCat === 'todos' ? 'Treinar todos os termos' : 'Treinar só ' + (ROTULO_CAT[filtroCat] || filtroCat);

      var visiveis = TERMOS.filter(function (t) { return filtroCat === 'todos' || t.category === filtroCat; });
      el.listaTermos.innerHTML = '';
      visiveis.forEach(function (t) {
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'item';
        var caixa = (prog[t.id] && prog[t.id].caixa) || 0;
        var sil = t.syllables.map(function (s, i) {
          var forte = (i === t.stress) || (s === s.toUpperCase() && /[A-Z]/.test(s));
          return forte ? '<b>' + escapar(s) + '</b>' : escapar(s);
        }).join('-');
        b.innerHTML = '<span class="txt"><span class="nome">' + escapar(t.sigla ? t.sigla + ' · ' + t.term : t.term) +
          '</span><span class="sil-mini">' + sil + '</span></span>' +
          '<span class="caixa' + (caixa === 3 ? ' c3' : caixa === 1 ? ' c1' : '') + '">' + (caixa ? 'caixa ' + caixa : 'novo') + '</span>';
        b.onclick = function () { abrirConsulta(t); };
        li.appendChild(b);
        el.listaTermos.appendChild(li);
      });
    },

    desenharProgresso: function () {
      var prog = Leitner.tudo();
      var seq = Leitner.sequencia();
      var dominados = TERMOS.filter(function (t) { return prog[t.id] && prog[t.id].caixa === 3; });
      var errando = TERMOS.filter(function (t) { return prog[t.id] && prog[t.id].caixa === 1; });
      var vistos = TERMOS.filter(function (t) { return !!prog[t.id]; });

      el.numeros.innerHTML =
        bloco(dominados.length + '/' + TERMOS.length, 'dominados') +
        bloco(String(errando.length), 'ainda erra') +
        bloco(String(seq.seguidos || 0), (seq.seguidos === 1 ? 'dia seguido' : 'dias seguidos'));

      lista(el.listaErrados, errando, 'Nada na caixa 1. Bom sinal.');
      lista(el.listaDominados, dominados, 'Ainda nenhum termo na caixa 3.');
      void vistos;

      function bloco(n, rot) { return '<div class="num"><b>' + escapar(n) + '</b><span>' + rot + '</span></div>'; }
      function lista(alvo, itens, vazio) {
        alvo.innerHTML = '';
        if (!itens.length) { alvo.innerHTML = '<li class="vazio" style="padding:18px">' + vazio + '</li>'; return; }
        itens.forEach(function (t) {
          var li = document.createElement('li');
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'item';
          var p = prog[t.id] || {};
          b.innerHTML = '<span class="txt"><span class="nome">' + escapar(t.sigla || t.term) +
            '</span><span class="sil-mini">' + escapar('acertos ' + (p.acertos || 0) + ' · erros ' + (p.erros || 0) + ' · volta em ' + (p.vence || '—')) + '</span></span>';
          b.onclick = function () { abrirConsulta(t); };
          li.appendChild(b);
          alvo.appendChild(li);
        });
      }
    },

    fimDaSessao: function () {
      el.fimSessao.hidden = false;
      el.areaCartao.hidden = true;
      el.acoes.hidden = true;
      var prog = Leitner.tudo();
      var dominados = TERMOS.filter(function (t) { return prog[t.id] && prog[t.id].caixa === 3; }).length;
      var seq = Leitner.sequencia();
      el.resumoSessao.textContent = 'Você treinou ' + sessao.length + ' ' + (sessao.length === 1 ? 'termo' : 'termos') + '.';
      el.numerosFim.innerHTML =
        '<div class="num"><b>' + dominados + '/' + TERMOS.length + '</b><span>dominados</span></div>' +
        '<div class="num"><b>' + (seq.seguidos || 0) + '</b><span>' + (seq.seguidos === 1 ? 'dia seguido' : 'dias seguidos') + '</span></div>' +
        '<div class="num"><b>' + (seq.total || 0) + '</b><span>' + (seq.total === 1 ? 'dia no total' : 'dias no total') + '</span></div>';
      UI.atualizarContador();
      Tela.soltar();
    }
  };

  function escapar(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* =========================================================
     Fluxo
     ========================================================= */
  function iniciarDia() {
    modoConsulta = false;
    sessao = montarSessao(TAM_SESSAO);
    indice = 0;
    if (!sessao.length) { UI.fimDaSessao(); return; }
    el.fimSessao.hidden = true;
    el.areaCartao.hidden = false;
    UI.desenharCartao();
  }

  function treinarCategoria(cat) {
    var base = TERMOS.filter(function (t) { return cat === 'todos' || t.category === cat; });
    var prog = Leitner.tudo();
    sessao = base.sort(function (a, b) {
      return ((prog[a.id] && prog[a.id].caixa) || 1) - ((prog[b.id] && prog[b.id].caixa) || 1);
    }).slice(0, TAM_SESSAO);
    indice = 0;
    modoConsulta = false;
    el.fimSessao.hidden = true;
    el.areaCartao.hidden = false;
    UI.trocarTela('hoje');
    UI.desenharCartao();
  }

  function abrirConsulta(t) {
    sessao = [t];
    indice = 0;
    modoConsulta = true;
    el.fimSessao.hidden = true;
    el.areaCartao.hidden = false;
    UI.trocarTela('hoje');
    UI.desenharCartao();
  }

  function responder(acertou) {
    var t = sessao[indice];
    if (!t) return;
    Leitner.registrar(t.id, acertou);
    feitosHoje[t.id] = true;
    indice++;
    if (indice >= sessao.length) { UI.fimDaSessao(); return; }
    UI.desenharCartao();
  }

  /* =========================================================
     Botões
     ========================================================= */
  el.btnOuvir.addEventListener('click', function () {
    UI.revelar();
    UI.aviso('cartao', '');
    Voz.falar(sessao[indice].speak, 1);
  });

  el.btnFrase.addEventListener('click', function () {
    UI.aviso('cartao', '');
    Voz.falar(sessao[indice].enPhrase, 1);
  });

  el.btnDevagar.addEventListener('click', function () {
    UI.revelar();
    UI.aviso('cartao', '');
    Voz.falar(sessao[indice].speak, Number(ajustes.lento) || 0.6);
  });

  el.btnGravar.addEventListener('click', function () {
    var t = sessao[indice];
    UI.revelar();
    if (Gravador.gravando) { Gravador.parar(); return; }
    UI.aviso('cartao', '');
    el.btnGravar.innerHTML = '<span class="ic" aria-hidden="true">⏹️</span> Parar';
    el.btnGravar.classList.add('grav');
    el.estadoGravando.hidden = false;
    el.textoGravando.textContent = 'Gravando… fale agora';

    Gravador.comecar(function () {
      el.btnGravar.innerHTML = '<span class="ic" aria-hidden="true">🎙️</span> Gravar';
      el.btnGravar.classList.remove('grav');
      el.textoGravando.textContent = 'Ouça: primeiro o aparelho, depois você';
      // Comparação A/B, sem precisar de outro toque
      Voz.falar(t.speak, 1).then(function () {
        return new Promise(function (r) { setTimeout(r, 350); });
      }).then(function () {
        return Gravador.tocar();
      }).then(function (ok) {
        el.estadoGravando.hidden = true;
        if (!ok) UI.aviso('cartao', 'Gravei, mas não consegui tocar o áudio aqui.', 'erro');
        else UI.aviso('cartao', 'Ouviu a diferença na sílaba forte? Grave de novo se quiser.', '');
      });
    }, function (msg) {
      el.btnGravar.innerHTML = '<span class="ic" aria-hidden="true">🎙️</span> Gravar';
      el.btnGravar.classList.remove('grav');
      el.estadoGravando.hidden = true;
      UI.aviso('cartao', escapar(msg), 'erro');
    });
  });

  el.btnConferir.addEventListener('click', function () {
    var t = sessao[indice];
    UI.revelar();
    Voz.parar();
    UI.aviso('cartao', 'Ouvindo… fale a palavra agora.', 'destaque');
    Conferencia.ouvir(t, function (acertou, ouvido) {
      UI.aviso('cartao',
        acertou ? 'Entendi <em>' + escapar(ouvido) + '</em>' : 'Entendi <em>' + escapar(ouvido) + '</em>, tente de novo',
        acertou ? 'bom' : 'erro');
    }, function (msg) {
      UI.aviso('cartao', escapar(msg), 'erro');
    });
  });

  el.btnAcertei.addEventListener('click', function () { responder(true); });
  el.btnRepetir.addEventListener('click', function () { responder(false); });
  el.btnTreinarMais.addEventListener('click', function () {
    sessao = montarExtra(TAM_SESSAO);
    indice = 0;
    if (!sessao.length) { UI.aviso('global', 'Você já passou por todos os termos hoje. Volte amanhã.', 'bom'); return; }
    el.fimSessao.hidden = true;
    el.areaCartao.hidden = false;
    UI.desenharCartao();
  });

  document.querySelectorAll('.nav button').forEach(function (b) {
    b.addEventListener('click', function () { UI.trocarTela(b.dataset.tela); });
  });

  el.btnZerar.addEventListener('click', function () {
    if (el.btnZerar.dataset.confirma === '1') {
      Leitner.zerar();
      feitosHoje = {};
      el.btnZerar.dataset.confirma = '';
      el.btnZerar.textContent = 'Apagar todo o progresso';
      UI.desenharProgresso();
      UI.aviso('global', 'Progresso apagado.', 'bom');
      iniciarDia();
    } else {
      el.btnZerar.dataset.confirma = '1';
      el.btnZerar.textContent = 'Tem certeza? Toque de novo';
      setTimeout(function () {
        el.btnZerar.dataset.confirma = '';
        el.btnZerar.textContent = 'Apagar todo o progresso';
      }, 5000);
    }
  });

  el.selVoz.addEventListener('change', function () { Voz.usar(el.selVoz.value); });
  el.btnTestarVoz.addEventListener('click', function () { Voz.falar('Advisory. Finance and Backoffice Transformation.', 1); });
  el.rangeLento.addEventListener('input', function () {
    ajustes.lento = Number(el.rangeLento.value);
    el.valorLento.textContent = el.rangeLento.value;
    salvarAjustes();
  });
  el.chkGravar.addEventListener('change', function () {
    ajustes.gravar = el.chkGravar.checked;
    salvarAjustes();
    el.btnGravar.hidden = !(ajustes.gravar && Gravador.suportado) || vozFalhou;
    UI.atualizarAcoes();
  });
  el.chkTela.addEventListener('change', function () {
    ajustes.telaAcesa = el.chkTela.checked;
    salvarAjustes();
    if (ajustes.telaAcesa && telaAtual === 'hoje') Tela.pedir(); else Tela.soltar();
  });

  function atualizarConferir() {
    el.btnConferir.hidden = !Conferencia.disponivel();
    UI.atualizarAcoes();
  }
  window.addEventListener('online', atualizarConferir);
  window.addEventListener('offline', atualizarConferir);

  /* =========================================================
     PWA
     ========================================================= */
  var promptInstalar = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    promptInstalar = e;
    if (!ehStandalone()) el.btnInstalar.hidden = false;
  });
  el.btnInstalar.addEventListener('click', function () {
    if (!promptInstalar) return;
    promptInstalar.prompt();
    promptInstalar.userChoice.then(function () {
      promptInstalar = null;
      el.btnInstalar.hidden = true;
    });
  });
  window.addEventListener('appinstalled', function () {
    el.btnInstalar.hidden = true;
    el.ajudaInstalar.textContent = 'App instalado.';
  });
  function ehStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.__SEM_SW__) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* app funciona sem cache offline */ });
    });
  }

  /* =========================================================
     Partida
     ========================================================= */
  function aplicarAjustesNaTela() {
    el.rangeLento.value = String(ajustes.lento);
    el.valorLento.textContent = String(ajustes.lento);
    el.chkGravar.checked = !!ajustes.gravar;
    el.chkTela.checked = !!ajustes.telaAcesa;
    el.infoVersao.textContent = 'Treino de Pronúncia ' + VERSAO + ' · ' + TERMOS.length + ' termos' +
      (ehStandalone() ? ' · instalado' : '');
    if (!Gravador.suportado) {
      el.btnGravar.hidden = true;
      el.chkGravar.disabled = true;
    }
    if (!navigator.wakeLock) el.chkTela.disabled = true;
    if (!promptInstalar && ehStandalone()) el.ajudaInstalar.textContent = 'App já instalado.';
    atualizarConferir();
  }

  function carregarTermos() {
    if (window.__TERMOS__ && window.__TERMOS__.length) return Promise.resolve(window.__TERMOS__);
    return fetch('terms.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  carregarTermos().then(function (dados) {
    TERMOS = dados;
    aplicarAjustesNaTela();
    Voz.aoFicarPronta.push(function () { UI.vozPronta(); });
    if (Voz.pronta) UI.vozPronta();
    Voz.iniciar();
    iniciarDia();
    UI.trocarTela('hoje');
  }).catch(function () {
    UI.aviso('global', 'Não consegui carregar a lista de termos. Recarregue a página.', 'erro');
    el.acoes.hidden = true;
  });
})();
