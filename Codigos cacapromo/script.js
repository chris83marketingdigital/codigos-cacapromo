/**
 * Projeto: Caça-Promoções (Leitor de Encartes com IA)
 * Autor: Cristian Santos
 * Ano: 2026
 */

let API_KEY = localStorage.getItem('cp_gemini_api_key') || "";

// ==========================================
// 1. GPS AUTOMÁTICO + MAPA + PERSISTÊNCIA DE MERCADOS
// ==========================================
let coordsUsuario = [-22.9068, -43.1729]; // Rio de Janeiro padrão
let raioAtualKm = 1.5;

let mapa = L.map('mapa').setView(coordsUsuario, 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(mapa);

let marcadorUsuario = L.marker(coordsUsuario).addTo(mapa).bindPopup("<b>📍 Seu Ponto de Partida</b>");
let circuloRaio = L.circle(coordsUsuario, {
    color: '#2563eb',
    fillColor: '#3b82f6',
    fillOpacity: 0.15,
    radius: raioAtualKm * 1000
}).addTo(mapa);

let camadaMercados = L.layerGroup().addTo(mapa);
let mercadosSalvos = JSON.parse(localStorage.getItem('cp_mercados_salvos')) || [];

function restaurarMercadosNoMapa() {
    camadaMercados.clearLayers();
    mercadosSalvos.forEach(m => {
        adicionarPinoMapa(m.lat, m.lon, m.endereco, m.nome);
    });
}

function atualizarRaioNoMapa(novoRaioKm) {
    raioAtualKm = parseFloat(novoRaioKm);
    document.getElementById('valor-raio').innerText = `${raioAtualKm} km`;
    document.getElementById('slider-raio').value = raioAtualKm;

    circuloRaio.setRadius(raioAtualKm * 1000);
    mapa.fitBounds(circuloRaio.getBounds());
}

document.querySelectorAll('.btn-transporte').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-transporte').forEach(b => b.classList.remove('ativo'));
        e.currentTarget.classList.add('ativo');
        const raio = e.currentTarget.getAttribute('data-raio');
        atualizarRaioNoMapa(raio);
    });
});

document.getElementById('slider-raio').addEventListener('input', (e) => {
    document.querySelectorAll('.btn-transporte').forEach(b => b.classList.remove('ativo'));
    atualizarRaioNoMapa(e.target.value);
});

function iniciarGpsAutomatico() {
    const statusGps = document.getElementById('status-gps');
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            coordsUsuario = [pos.coords.latitude, pos.coords.longitude];
            marcadorUsuario.setLatLng(coordsUsuario).bindPopup("<b>📍 Você está aqui!</b>").openPopup();
            circuloRaio.setLatLng(coordsUsuario);
            mapa.fitBounds(circuloRaio.getBounds());
            statusGps.innerText = "✅ Localização obtida via GPS automático!";
        }, () => {
            statusGps.innerText = "⚠️ GPS automático negado. Usando Rio de Janeiro como padrão.";
        }, { timeout: 10000 });
    } else {
        statusGps.innerText = "⚠️ Geolocalização não suportada pelo navegador.";
    }
}
iniciarGpsAutomatico();

// ==========================================
// 2. BANCO DE DADOS LOCAL
// ==========================================
let listaProdutos = JSON.parse(localStorage.getItem('cp_produtos_reais')) || [];
let listaCasa = JSON.parse(localStorage.getItem('cp_lista_casa')) || [];
let historicoEncartes = JSON.parse(localStorage.getItem('cp_historico_encartes')) || [];
let backupDesfazer = null;

// Acumulador unificado de arquivos (permite juntar fotos da câmera e da galeria)
let arquivosSelecionadosParaEnvio = [];

function salvarTudo() {
    localStorage.setItem('cp_produtos_reais', JSON.stringify(listaProdutos));
    localStorage.setItem('cp_lista_casa', JSON.stringify(listaCasa));
    localStorage.setItem('cp_historico_encartes', JSON.stringify(historicoEncartes));
    localStorage.setItem('cp_mercados_salvos', JSON.stringify(mercadosSalvos));
    renderizarTudo();
}

// ==========================================
// 3. SISTEMA DE ABAS
// ==========================================
document.querySelectorAll('.btn-aba').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-aba').forEach(b => b.classList.remove('ativo'));
        e.currentTarget.classList.add('ativo');

        const abaAlvo = e.currentTarget.getAttribute('data-aba');
        document.getElementById('aba-comparador').style.display = (abaAlvo === 'aba-comparador') ? 'block' : 'none';
        document.getElementById('aba-lista-casa').style.display = (abaAlvo === 'aba-lista-casa') ? 'block' : 'none';
    });
});

// ==========================================
// 4. CAPTURA DE FOTOS (CÂMERA E GALERIA SEPARADAS)
// ==========================================
const inputCamera = document.getElementById('input-camera');
const inputGaleria = document.getElementById('input-galeria');
const btnAbrirCamera = document.getElementById('btn-abrir-camera');
const btnAbrirGaleria = document.getElementById('btn-abrir-galeria');
const containerPreviews = document.getElementById('container-previews');

if (btnAbrirCamera && inputCamera) {
    btnAbrirCamera.addEventListener('click', () => inputCamera.click());
    inputCamera.addEventListener('change', function() {
        adicionarArquivos(this.files);
    });
}

if (btnAbrirGaleria && inputGaleria) {
    btnAbrirGaleria.addEventListener('click', () => inputGaleria.click());
    inputGaleria.addEventListener('change', function() {
        adicionarArquivos(this.files);
    });
}

function adicionarArquivos(novosFiles) {
    if (!novosFiles || novosFiles.length === 0) return;
    for (let i = 0; i < novosFiles.length; i++) {
        arquivosSelecionadosParaEnvio.push(novosFiles[i]);
    }
    atualizarInterfacePreviews();
}

function atualizarInterfacePreviews() {
    if (!containerPreviews) return;
    containerPreviews.innerHTML = '';
    if (arquivosSelecionadosParaEnvio.length === 0) {
        return;
    }

    arquivosSelecionadosParaEnvio.forEach((file, index) => {
        const span = document.createElement('div');
        span.className = 'tag-arquivo-selecionado';
        span.innerText = `📷 [${index + 1}] ${file.name}`;
        containerPreviews.appendChild(span);
    });
}

// Compressão otimizada (900px e 0.70 de qualidade)
function comprimirImagemParaBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 900;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.70);
                resolve(dataUrl.split(',')[1]);
            };
            img.onerror = err => reject(err);
        };
        reader.onerror = err => reject(err);
    });
}

function limparPreco(valorBruto) {
    if (typeof valorBruto === 'number') return valorBruto;
    if (!valorBruto) return 0;
    const limpo = String(valorBruto).replace(/[^\d.,]/g, '').replace(',', '.');
    return parseFloat(limpo) || 0;
}

function extrairJsonSeguro(texto) {
    try {
        let textoLimpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
        const inicio = textoLimpo.indexOf('{');
        const fim = textoLimpo.lastIndexOf('}');
        if (inicio !== -1 && fim !== -1) {
            textoLimpo = textoLimpo.substring(inicio, fim + 1);
        }
        textoLimpo = textoLimpo.replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(textoLimpo);
    } catch (e) {
        console.error("Erro ao converter JSON:", texto);
        throw new Error("A IA gerou uma resposta mal formatada. Tente enviar a imagem novamente.");
    }
}

window.trocarChaveApi = function() {
    const nova = prompt("Cole aqui sua chave API Key do Google:");
    if (nova && nova.trim().length > 10) {
        API_KEY = nova.trim();
        localStorage.setItem('cp_gemini_api_key', API_KEY);
        alert("✅ Chave salva! Agora clique no botão verde para escanear.");
    }
};

// Processamento em lote progressivo
const btnLerIa = document.getElementById('btn-ler-ia');
if (btnLerIa) {
    btnLerIa.addEventListener('click', async () => {
        const resultadoIa = document.getElementById('resultado-ia');

        if (arquivosSelecionadosParaEnvio.length === 0) {
            alert("Selecione pelo menos uma imagem (tirando foto ou da galeria)!");
            return;
        }

        const totalArquivos = arquivosSelecionadosParaEnvio.length;

        for (let i = 0; i < totalArquivos; i++) {
            const file = arquivosSelecionadosParaEnvio[i];
            if (resultadoIa) {
                resultadoIa.innerHTML = `
                    <div style="background:#eff6ff; color:#1d4ed8; padding:12px; border-radius:8px; margin-top:10px; border:1px solid #93c5fd;">
                        <strong>⚡ A processar página ${i + 1} de ${totalArquivos}</strong><br>
                        <small>Ficheiro: ${file.name || 'foto_camera.jpg'} (otimizando e enviando à IA...)</small>
                    </div>
                `;
            }

            try {
                const chaveLimpa = API_KEY.trim();
                const base64Image = await comprimirImagemParaBase64(file);

                const promptTexto = `Analise esta página de encarte de supermercado. Extraia TODOS os produtos e preços visíveis. 
                ATENÇÃO ÀS VARIAÇÕES: Diferencie o tipo exato (Ex: "Sabão em Pó", "Sabão Líquido", "Sabão em Barra", "Achocolatado em Pó Nescau", "Bebida Láctea Achocolatada").
                Retorne APENAS um JSON válido estritamente neste formato:
                {
                  "supermercado": "Nome do Supermercado",
                  "endereco": "Endereço ou bairro impresso no encarte (ou nome do mercado + Rio de Janeiro)",
                  "produtos": [
                    { "nome": "Nome detalhado com variação", "marca": "Marca", "gramatura": "Gramatura exata", "preco": 0.00 }
                  ]
                }
                Use ponto nos centavos do preco (ex: 12.99). Não inclua texto fora do JSON.`;

                const payload = {
                    contents: [{
                        parts: [
                            { text: promptTexto },
                            { 
                                inline_data: { 
                                    mime_type: "image/jpeg", 
                                    data: base64Image 
                                } 
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 8192
                    }
                };

                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${chaveLimpa}`;
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const resJson = await response.json();
                if (!response.ok || !resJson.candidates?.[0]?.content?.parts?.[0]?.text) {
                    throw new Error(resJson.error?.message || `Erro HTTP ${response.status}`);
                }

                const textoBruto = resJson.candidates[0].content.parts[0].text;
                const dados = extrairJsonSeguro(textoBruto);

                const listaExtraida = dados.produtos || dados.itens || dados.ofertas || [];
                const nomeMercado = dados.supermercado || "Supermercado Identificado";
                const enderecoMercado = dados.endereco || `${nomeMercado}, Rio de Janeiro`;

                let itensValidos = 0;
                listaExtraida.forEach(p => {
                    const precoNum = limparPreco(p.preco);
                    if (precoNum > 0) {
                        listaProdutos.push({
                            nome: p.nome || "Produto em Oferta",
                            marca: p.marca || "-",
                            gramatura: p.gramatura || "Unid.",
                            preco: precoNum,
                            mercado: nomeMercado,
                            endereco: enderecoMercado
                        });
                        itensValidos++;
                    }
                });

                const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                historicoEncartes.unshift({
                    horario: agora,
                    supermercado: nomeMercado,
                    endereco: enderecoMercado,
                    qtdItens: itensValidos,
                    resumoItens: listaExtraida.map(p => `${p.nome} R$ ${limparPreco(p.preco).toFixed(2)}`).join(' | ')
                });

                salvarTudo();
                await geocodificarEAdicionarMercado(enderecoMercado, nomeMercado);

                if (resultadoIa) {
                    resultadoIa.innerHTML = `
                        <div style="background:#ecfdf5; color:#065f46; padding:12px; border-radius:8px; margin-top:10px; border:1px solid #a7f3d0;">
                            <strong>✅ Página ${i + 1} de ${totalArquivos} concluída!</strong><br>
                            <small>${nomeMercado}: ${itensValidos} produtos extraídos com sucesso.</small>
                        </div>
                    `;
                }

            } catch (erro) {
                console.error("Detalhes do erro:", erro);
                if (resultadoIa) {
                    resultadoIa.innerHTML = `
                        <div style="background:#fee2e2; color:#991b1b; padding:12px; border-radius:8px; margin-top:10px; border:1px solid #fca5a5;">
                            <strong>❌ Falha na página ${i + 1}:</strong><br>
                            <small>${erro.message}</small><br><br>
                            <button onclick="trocarChaveApi()" style="background:#dc2626; color:#fff; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-weight:bold;">
                                🔑 Trocar Chave API Key Aqui
                            </button>
                        </div>
                    `;
                }
            }
        }
        // Limpa a fila após o término
        arquivosSelecionadosParaEnvio = [];
    });
}

async function geocodificarEAdicionarMercado(endereco, nomeMercado) {
    if (!endereco) return;
    try {
        const query = encodeURIComponent(endereco);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`);
        const locais = await res.json();

        if (locais && locais.length > 0) {
            const lat = parseFloat(locais[0].lat);
            const lon = parseFloat(locais[0].lon);

            if (!mercadosSalvos.some(m => m.nome.toLowerCase() === nomeMercado.toLowerCase())) {
                mercadosSalvos.push({ nome: nomeMercado, endereco, lat, lon });
                localStorage.setItem('cp_mercados_salvos', JSON.stringify(mercadosSalvos));
            }

            adicionarPinoMapa(lat, lon, endereco, nomeMercado);
            mapa.setView([lat, lon], 14);
        }
    } catch (e) {
        console.error("Erro ao buscar mapa:", e);
    }
}

function adicionarPinoMapa(lat, lon, endereco, nomeMercado) {
    const linkOnibusGoogleMaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(nomeMercado + " " + endereco)}&travelmode=transit`;

    const marcador = L.marker([lat, lon]).addTo(camadaMercados);
    marcador.bindPopup(`
        <b>🛒 ${nomeMercado}</b><br>
        <small>${endereco}</small><br>
        <a href="${linkOnibusGoogleMaps}" target="_blank" class="btn-onibus-mapa">🚌 Ver Ônibus / Como Chegar</a>
    `);
}

// ==========================================
// 5. RENDERIZAÇÃO
// ==========================================
function renderizarTudo() {
    renderizarVitrineDestaques();
    renderizarComparador();
    renderizarListaCasa();
    renderizarHistoricoIa();
    restaurarMercadosNoMapa();
}

function renderizarVitrineDestaques() {
    const vitrine = document.getElementById('vitrine-destaques');
    if (!vitrine) return;
    if (listaProdutos.length === 0) {
        vitrine.innerHTML = `<div class="aviso-vazio">Nenhum encarte real escaneado ainda.</div>`;
        return;
    }

    const ordenados = [...listaProdutos].filter(p => p.preco > 0).sort((a, b) => a.preco - b.preco).slice(0, 4);

    vitrine.innerHTML = ordenados.map(item => `
        <div class="cartao-destaque">
            <span class="mercado-tag">📍 ${item.mercado}</span>
            <h4>${item.nome}</h4>
            <span class="marca-gramatura">Marca: ${item.marca} • ${item.gramatura}</span>
            <div class="preco-campeao">R$ ${item.preco.toFixed(2)}</div>
        </div>
    `).join('');
}

const buscaProdutoEl = document.getElementById('busca-produto');
if (buscaProdutoEl) {
    buscaProdutoEl.addEventListener('input', renderizarComparador);
}

function renderizarComparador() {
    const painel = document.getElementById('painel-comparador');
    if (!painel) return;
    const termoBusca = document.getElementById('busca-produto') ? document.getElementById('busca-produto').value.toLowerCase().trim() : '';

    if (listaProdutos.length === 0) {
        painel.innerHTML = `<div class="aviso-vazio">A lista de comparação está limpa. Escaneie encartes!</div>`;
        return;
    }

    const filtrados = listaProdutos.filter(p => {
        const nomeProd = p.nome.toLowerCase();
        const marcaProd = p.marca.toLowerCase();
        const mercadoProd = p.mercado.toLowerCase();
        return nomeProd.includes(termoBusca) || marcaProd.includes(termoBusca) || mercadoProd.includes(termoBusca);
    });

    if (filtrados.length === 0) {
        painel.innerHTML = `<div class="aviso-vazio">Nenhum produto encontrado para "${termoBusca}".</div>`;
        return;
    }

    const grupos = {};
    filtrados.forEach(p => {
        const chave = `${p.nome.trim().toUpperCase()} (${p.gramatura.trim().toLowerCase()})`;
        if (!grupos[chave]) grupos[chave] = [];
        grupos[chave].push(p);
    });

    let html = '';
    for (const [produtoTitulo, ofertas] of Object.entries(grupos)) {
        ofertas.sort((a, b) => a.preco - b.preco);

        html += `<div class="card-confronto"><h4>📦 ${produtoTitulo}</h4>`;
        ofertas.forEach((oferta, index) => {
            const ehVencedor = index === 0 && ofertas.length > 1;
            html += `
                <div class="linha-mercado-preco ${ehVencedor ? 'vencedor' : ''}">
                    <span><strong>${oferta.mercado}</strong> <small>(Marca: ${oferta.marca})</small> ${ehVencedor ? '🏆 Mais Barato' : ''}</span>
                    <span>R$ ${oferta.preco.toFixed(2)}</span>
                </div>
            `;
        });
        html += `</div>`;
    }

    painel.innerHTML = html;
}

const btnAddCasa = document.getElementById('btn-add-casa');
if (btnAddCasa) {
    btnAddCasa.addEventListener('click', () => {
        const input = document.getElementById('input-item-casa');
        if (!input) return;
        const texto = input.value.trim();
        if (!texto) return;

        listaCasa.push({ texto, comprado: false });
        input.value = '';
        salvarTudo();
    });
}

function renderizarListaCasa() {
    const ul = document.getElementById('lista-compras-casa');
    if (!ul) return;
    if (listaCasa.length === 0) {
        ul.innerHTML = `<div class="aviso-vazio">Sua lista de casa está vazia.</div>`;
        return;
    }

    ul.innerHTML = listaCasa.map((item, idx) => {
        const palavraChave = item.texto.toLowerCase().split(' ')[0];
        const matches = listaProdutos.filter(p => p.nome.toLowerCase().includes(palavraChave)).sort((a, b) => a.preco - b.preco);

        let badgeHtml = `<span class="badge-sem-match">Sem preço nos encartes ainda</span>`;
        if (matches.length > 0) {
            const melhor = matches[0];
            badgeHtml = `<span class="badge-match">🏆 R$ ${melhor.preco.toFixed(2)} no ${melhor.mercado} (${melhor.marca})</span>`;
        }

        return `
            <li class="item-casa ${item.comprado ? 'riscado' : ''}">
                <div style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" ${item.comprado ? 'checked' : ''} onchange="alternarItemCasa(${idx})">
                    <span class="nome-item-casa"><strong>${item.texto}</strong></span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    ${badgeHtml}
                    <button class="btn-secundario btn-perigo" onclick="removerItemCasa(${idx})">✖</button>
                </div>
            </li>
        `;
    }).join('');
}

window.alternarItemCasa = function(idx) {
    listaCasa[idx].comprado = !listaCasa[idx].comprado;
    salvarTudo();
};

window.removerItemCasa = function(idx) {
    listaCasa.splice(idx, 1);
    salvarTudo();
};

function renderizarHistoricoIa() {
    const container = document.getElementById('historico-encartes');
    if (!container) return;
    if (historicoEncartes.length === 0) {
        container.innerHTML = `<div class="aviso-vazio">Nenhum encarte lido nesta sessão.</div>`;
        return;
    }

    container.innerHTML = historicoEncartes.map(h => `
        <div class="card-historico">
            <strong>🕒 ${h.horario} 🛒 ${h.supermercado}</strong> (${h.qtdItens} itens extraídos)<br>
            <small>📍 Endereço identificado: ${h.endereco}</small>
            <p style="margin-top:6px; font-size:0.85rem; color:#334155;">${h.resumoItens}</p>
        </div>
    `).join('');
}

const btnLimparLista = document.getElementById('btn-limpar-lista');
if (btnLimparLista) {
    btnLimparLista.addEventListener('click', () => {
        if (confirm("Tem certeza que deseja zerar os produtos escaneados e o histórico?")) {
            backupDesfazer = { produtos: [...listaProdutos], historico: [...historicoEncartes] };
            listaProdutos = [];
            historicoEncartes = [];
            const btnDesfazer = document.getElementById('btn-desfazer');
            if (btnDesfazer) btnDesfazer.style.display = 'inline-block';
            salvarTudo();
        }
    });
}

const btnDesfazerEl = document.getElementById('btn-desfazer');
if (btnDesfazerEl) {
    btnDesfazerEl.addEventListener('click', () => {
        if (backupDesfazer) {
            listaProdutos = backupDesfazer.produtos;
            historicoEncartes = backupDesfazer.historico;
            backupDesfazer = null;
            btnDesfazerEl.style.display = 'none';
            salvarTudo();
        }
    });
}

renderizarTudo();