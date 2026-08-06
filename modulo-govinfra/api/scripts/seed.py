"""Carga de demonstração do GovInfra (item 56).

Cria a organização, usuários de referência, regiões, motivos de bloqueio,
tipos de resíduo, caçambas, pessoas, produtores, propriedades, máquinas,
veículos, operadores, tipos de serviço, o programa Porteira Adentro com
saldos de horas, solicitações em vários estados, ordem de serviço,
abastecimentos e manutenções.

Os dados são 100% fictícios e claramente identificados como demonstração.
O script é idempotente: pode rodar quantas vezes quiser sem duplicar.

Uso:
    python -m scripts.seed
"""

import asyncio
import random
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session
from app.core.security import token_consulta
from app.models.bloqueios import MotivoBloqueio
from app.models.cacambas import Cacamba, SolicitacaoCacamba, TipoResiduo
from app.models.combustivel import Abastecimento, Tanque
from app.models.enums import (
    MetodoDesconto,
    Prioridade,
    SituacaoBeneficiario,
    SituacaoCacamba,
    SituacaoEquipamento,
    TipoMovimentoCombustivel,
    TipoPessoa,
)
from app.models.frota import CategoriaMaquina, Habilitacao, Maquina, Veiculo
from app.models.governanca import Regiao
from app.models.manutencao import Manutencao, PlanoManutencao
from app.models.organizacao import Organizacao, User
from app.models.pessoas import Imovel, Pessoa, PessoaImovel
from app.models.porteira import (
    Beneficiario,
    OrdemServico,
    Programa,
    SolicitacaoServico,
    TipoServico,
)
from app.services import banco_horas, protocolo
from app.services.configuracoes import garantir_configuracoes_padrao

random.seed(20260804)

MUNICIPIO = settings.MUNICIPIO_NOME
UF = settings.MUNICIPIO_UF

CITADOS = [
    ("Ana Beatriz Oliveira", "Rua das Acácias", "Centro"),
    ("Carlos Eduardo Souza", "Av. Brasil", "Centro"),
    ("Mariana Costa Lima", "Rua 7 de Setembro", "São José"),
    ("José Aparecido Santos", "Rua do Comércio", "Centro"),
    ("Fernanda Ribeiro", "Rua das Hortênsias", "Vila Nova"),
    ("Pedro Henrique Alves", "Travessa da Paz", "São José"),
    ("Juliana Pereira", "Rua XV de Novembro", "Centro"),
    ("Rafael Martins", "Rua da Igreja", "Vila Nova"),
    ("Camila Rodrigues", "Rua dos Pinheiros", "Industrial"),
    ("Lucas Gabriel Nunes", "Av. do Trabalhador", "Industrial"),
]

PRODUTORES = [
    ("Alcides Ferreira da Silva", "Linha Alto Bonito", "Produtor de grãos"),
    ("Neuza Maria Cardoso", "Linha São Valentim", "Bovinocultura de leite"),
    ("Olavo Antônio Weber", "Linha Tigre", "Suinocultura"),
    ("Rozilda Aparecida Farias", "Linha Baixo Bonito", "Horticultura"),
    ("Valdir José Klein", "Linha São Luiz", "Produtor de grãos"),
]

TIPOS_RESIDUO = [
    ("entulho", "Entulho de obra", False, "Aterro autorizado"),
    ("terra", "Terra e solo", False, "Bota-fora municipal"),
    ("poda", "Poda e jardinagem", False, "Compostagem municipal"),
    ("moveis", "Móveis e objetos", False, "Triagem e descarte seletivo"),
    ("reciclaveis", "Recicláveis", False, "Cooperativa de reciclagem"),
    ("quimico", "Material químico", True, None),
    ("organico", "Material orgânico", True, None),
    ("hospitalar", "Resíduo hospitalar", True, None),
]

SERVICOS = [
    ("manutencao_estrada", "Manutenção de estrada interna", ["retroescavadeira", "motoniveladora"], True, 6, 18),
    ("abertura_estrada", "Abertura de estrada", ["retroescavadeira", "motoniveladora"], True, 8, 24),
    ("cascalhamento", "Cascalhamento", ["caminhao_cacamba", "motoniveladora"], True, 6, 20),
    ("terraplanagem", "Terraplanagem", ["retroescavadeira", "motoniveladora", "pag_carregadeira"], True, 6, 18),
    ("limpeza_area", "Limpeza de área", ["retroescavadeira", "pag_carregadeira"], False, 4, 12),
    ("abertura_valas", "Abertura de valas", ["retroescavadeira"], False, 3, 9),
    ("construcao_acude", "Construção de açude", ["retroescavadeira", "escavadeira_hidraulica"], True, 10, 30),
    ("limpeza_acude", "Limpeza de açude", ["retroescavadeira", "escavadeira_hidraulica"], True, 8, 24),
    ("curva_nivel", "Construção de curva de nível", ["trator"], False, 4, 12),
    ("transporte_terra", "Transporte de terra", ["caminhao_cacamba"], False, 5, 15),
    ("transporte_cascalho", "Transporte de cascalho", ["caminhao_cacamba"], False, 5, 15),
    ("servico_retro", "Serviço com retroescavadeira", ["retroescavadeira"], False, 4, 12),
    ("servico_pag", "Serviço com pá carregadeira", ["pag_carregadeira"], False, 4, 12),
    ("servico_moto", "Serviço com motoniveladora", ["motoniveladora"], False, 4, 12),
    ("servico_escavadeira", "Serviço com escavadeira hidráulica", ["escavadeira_hidraulica"], False, 5, 15),
    ("servico_trator", "Serviço com trator", ["trator"], False, 4, 12),
]

MOTIVOS_BLOQUEIO = [
    ("solicitacao_duplicada", "Solicitação duplicada", "cacambas", "temporario", 30),
    ("duas_no_mesmo_dia", "Duas solicitações no mesmo dia", "cacambas", "temporario", 15),
    ("pendencia_anterior", "Pendência em atendimento anterior", "todos", "ate_regularizacao", None),
    ("cacamba_nao_liberada", "Caçamba não liberada para retirada", "cacambas", "ate_regularizacao", None),
    ("descarte_irregular", "Descarte irregular", "cacambas", "temporario", 90),
    ("material_proibido", "Material proibido", "cacambas", "temporario", 60),
    ("dano_patrimonio", "Dano ao patrimônio público", "todos", "temporario", 180),
    ("ausencia_atendimento", "Ausência no atendimento", "todos", "temporario", 60),
    ("informacoes_incorretas", "Informações incorretas", "todos", "temporario", 30),
    ("documento_pendente", "Documento pendente", "porteira_adentro", "ate_regularizacao", None),
    ("descumprimento_regras", "Descumprimento das regras do programa", "porteira_adentro", "temporario", 120),
    ("debito_pendente", "Débito ou taxa pendente", "todos", "ate_regularizacao", None),
    ("determinacao_administrativa", "Determinação administrativa", "todos", "temporario", 90),
    ("outro", "Outro", "todos", "temporario", 30),
]


def cpf_valido() -> str:
    """Gera um CPF válido (somente dígitos) — número fictício."""
    digitos = [random.randint(0, 9) for _ in range(9)]
    for _ in range(2):
        soma = sum((len(digitos) + 1 - i) * v for i, v in enumerate(digitos))
        resto = (soma * 10) % 11
        digitos.append(0 if resto == 10 else resto)
    return "".join(str(d) for d in digitos)


async def _procurar(db, modelo, **filtros):
    return await db.scalar(select(modelo).where(*[getattr(modelo, k) == v for k, v in filtros.items()]))


async def _seed_organizacao(db) -> tuple[Organizacao, User]:
    organizacao = await _procurar(db, Organizacao, externo_id="govinfra-demo")
    if organizacao is None:
        organizacao = Organizacao(
            externo_id="govinfra-demo",
            nome=f"Prefeitura Municipal de {MUNICIPIO} — demonstração",
            slug="demo-infra",
            uf=UF,
        )
        db.add(organizacao)
        await db.flush()
        print(f"  • organização criada: {organizacao.nome}")

    await garantir_configuracoes_padrao(db, organizacao.id)

    usuarios: dict[str, User] = {}
    for perfil, nome, email in [
        ("administrador", "Administrador da Secretaria", "admin.infra@demo.local"),
        ("gestor", "Gestor de Infraestrutura", "gestor.infra@demo.local"),
        ("atendente", "Atendente da Secretaria", "atendente@demo.local"),
        ("tecnico", "Técnico em Obras", "tecnico@demo.local"),
        ("operador", "Operador de Máquinas", "operador@demo.local"),
        ("motorista", "Motorista de Caminhão", "motorista@demo.local"),
        ("combustivel", "Responsável pelo Combustível", "combustivel@demo.local"),
        ("manutencao", "Responsável pela Manutenção", "manutencao@demo.local"),
        ("consulta", "Consulta (leitura)", "consulta@demo.local"),
    ]:
        usuario = await _procurar(db, User, externo_id=f"demo-{perfil}")
        if usuario is None:
            usuario = User(
                organizacao_id=organizacao.id,
                externo_id=f"demo-{perfil}",
                nome=nome,
                email=email,
                perfil=perfil,
                ativo=True,
            )
            db.add(usuario)
            await db.flush()
            print(f"  • usuário criado: {nome} ({perfil})")
        usuarios[perfil] = usuario
    return organizacao, usuarios


async def _seed_regioes(db, organizacao_id: uuid.UUID) -> dict[str, Regiao]:
    regioes: dict[str, Regiao] = {}
    dados = [
        ("centro", "Centro", ["Centro", "São José"], -27.2100, -52.0270),
        ("industrial", "Bairro Industrial", ["Industrial"], -27.2180, -52.0340),
        ("vila_nova", "Vila Nova", ["Vila Nova"], -27.2050, -52.0200),
        ("rural_norte", "Zona Rural Norte", ["Linha Alto Bonito", "Linha São Valentim", "Linha São Luiz"], -27.1900, -52.0400),
        ("rural_sul", "Zona Rural Sul", ["Linha Baixo Bonito", "Linha Tigre"], -27.2350, -52.0150),
    ]
    for chave, nome, bairros, lat, lon in dados:
        regiao = await _procurar(db, Regiao, organizacao_id=organizacao_id, chave=chave)
        if regiao is None:
            regiao = Regiao(
                organizacao_id=organizacao_id, chave=chave, nome=nome, bairros=bairros,
                tipo="urbana" if chave in ("centro", "industrial", "vila_nova") else "rural",
                latitude_centro=lat, longitude_centro=lon, atendida=True,
                dias_atendimento=[0, 1, 2, 3, 4], ativo=True,
            )
            db.add(regiao)
            await db.flush()
        regioes[chave] = regiao
    return regioes


async def _seed_motivos(db, organizacao_id: uuid.UUID) -> None:
    for chave, nome, servico, tipo, dias in MOTIVOS_BLOQUEIO:
        existente = await _procurar(db, MotivoBloqueio, organizacao_id=organizacao_id, chave=chave)
        if existente is None:
            db.add(MotivoBloqueio(
                organizacao_id=organizacao_id, chave=chave, nome=nome,
                servico_padrao=servico, tipo_padrao=tipo, dias_padrao=dias,
                exige_documento=False, ativo=True, ordem=len(MOTIVOS_BLOQUEIO),
            ))


async def _seed_residuos(db, organizacao_id: uuid.UUID) -> dict[str, TipoResiduo]:
    residuos: dict[str, TipoResiduo] = {}
    for chave, nome, proibido, destinacao in TIPOS_RESIDUO:
        existente = await _procurar(db, TipoResiduo, organizacao_id=organizacao_id, chave=chave)
        if existente is None:
            existente = TipoResiduo(
                organizacao_id=organizacao_id, chave=chave, nome=nome,
                proibido=proibido, exige_autorizacao=proibido,
                destinacao_padrao=destinacao, ativo=True,
            )
            db.add(existente)
            await db.flush()
        residuos[chave] = existente
    return residuos


async def _seed_cacambas(db, organizacao_id: uuid.UUID) -> list[Cacamba]:
    cacambas: list[Cacamba] = []
    for numero in range(1, 13):
        codigo = f"CB-{numero:03d}"
        existente = await _procurar(db, Cacamba, organizacao_id=organizacao_id, codigo=codigo)
        if existente is not None:
            cacambas.append(existente)
            continue
        ca = Cacamba(
            organizacao_id=organizacao_id, codigo=codigo,
            patrimonio=f"PAT-{1000 + numero}",
            identificacao_visual=f"Caçamba {numero}",
            tipo="entulho", modelo="4 m³", capacidade_m3=4.0,
            comprimento_m=2.4, largura_m=1.6, altura_m=1.1,
            cor="amarela", data_aquisicao=date(2022, 3, 10),
            valor_aquisicao=4200.0, estado_conservacao="bom",
            localizacao_padrao="Pátio da Secretaria",
            localizacao_atual="Pátio da Secretaria",
            qr_code=token_consulta(), situacao=SituacaoCacamba.DISPONIVEL.value,
            ultima_vistoria_em=date.today() - timedelta(days=120),
            proxima_vistoria_em=date.today() + timedelta(days=245),
        )
        db.add(ca)
        await db.flush()
        cacambas.append(ca)
    return cacambas


async def _seed_pessoas(db, organizacao_id: uuid.UUID, regioes: dict[str, Regiao]) -> tuple[list[Pessoa], list[Pessoa], list[Imovel]]:
    cidadaos: list[Pessoa] = []
    for nome, rua, bairro in CITADOS:
        existente = await _procurar(db, Pessoa, organizacao_id=organizacao_id, nome=nome)
        if existente is None:
            existente = Pessoa(
                organizacao_id=organizacao_id, nome=nome, documento=cpf_valido(),
                data_nascimento=date(random.randint(1965, 1995), random.randint(1, 12), random.randint(1, 28)),
                telefone=f"49{random.randint(100000000, 999999999)}",
                whatsapp=f"49{random.randint(100000000, 999999999)}",
                logradouro=rua, numero=str(random.randint(10, 999)),
                bairro=bairro, municipio=MUNICIPIO, uf=UF,
                tipos=[TipoPessoa.CIDADAO.value], situacao="ativo",
            )
            db.add(existente)
            await db.flush()
        cidadaos.append(existente)

    produtores: list[Pessoa] = []
    for nome, linha, atividade in PRODUTORES:
        existente = await _procurar(db, Pessoa, organizacao_id=organizacao_id, nome=nome)
        if existente is None:
            existente = Pessoa(
                organizacao_id=organizacao_id, nome=nome, documento=cpf_valido(),
                data_nascimento=date(random.randint(1958, 1985), random.randint(1, 12), random.randint(1, 28)),
                telefone=f"49{random.randint(100000000, 999999999)}",
                whatsapp=f"49{random.randint(100000000, 999999999)}",
                logradouro=linha, numero=str(random.randint(1, 500)),
                bairro=linha, municipio=MUNICIPIO, uf=UF,
                tipos=[TipoPessoa.PRODUTOR_RURAL.value, TipoPessoa.PROPRIETARIO.value],
                situacao="ativo", observacoes=f"Atividade: {atividade}",
            )
            db.add(existente)
            await db.flush()
        produtores.append(existente)

    imoveis: list[Imovel] = []
    chaves = [
        ("Urbano Centro 1", "urbano", "centro", "Rua das Acácias", "São José", "Casa"),
        ("Urbano Centro 2", "urbano", "centro", "Rua XV de Novembro", "Centro", "Casa"),
        ("Urbano Industrial 1", "urbano", "industrial", "Rua dos Pinheiros", "Industrial", "Galpão"),
        ("Chácara Alto Bonito", "rural", "rural_norte", "Linha Alto Bonito", "Linha Alto Bonito", "Chácara"),
        ("Sítio São Valentim", "rural", "rural_norte", "Linha São Valentim", "Linha São Valentim", "Sítio"),
        ("Fazenda São Luiz", "rural", "rural_norte", "Linha São Luiz", "Linha São Luiz", "Fazenda"),
        ("Sítio Baixo Bonito", "rural", "rural_sul", "Linha Baixo Bonito", "Linha Baixo Bonito", "Sítio"),
        ("Chácara Tigre", "rural", "rural_sul", "Linha Tigre", "Linha Tigre", "Chácara"),
    ]
    lat_base = {"centro": -27.210, "industrial": -27.218, "rural_norte": -27.190, "rural_sul": -27.235}
    lon_base = {"centro": -52.027, "industrial": -52.034, "rural_norte": -52.040, "rural_sul": -52.015}
    for codigo, tipo, regiao_chave, logradouro, bairro, nome in chaves:
        existente = await _procurar(db, Imovel, organizacao_id=organizacao_id, codigo=codigo)
        if existente is None:
            regiao = regioes.get(regiao_chave)
            existente = Imovel(
                organizacao_id=organizacao_id, codigo=codigo, nome=nome, tipo=tipo,
                logradouro=logradouro, numero=str(random.randint(1, 999)),
                bairro=bairro, municipio=MUNICIPIO, uf=UF,
                comunidade=bairro if tipo == "rural" else None,
                regiao_id=regiao.id if regiao else None,
                area_hectares=random.randint(2, 40) if tipo == "rural" else None,
                atividade_produtiva=random.choice(["grãos", "leite", "horticultura", None]),
                latitude=lat_base[regiao_chave] + random.uniform(-0.004, 0.004),
                longitude=lon_base[regiao_chave] + random.uniform(-0.004, 0.004),
                precisao_coordenada="aproximada", situacao="ativo",
            )
            db.add(existente)
            await db.flush()
        imoveis.append(existente)

    for imovel in imoveis:
        vinculo = await _procurar(db, PessoaImovel, imovel_id=imovel.id, principal=True)
        if vinculo is None:
            dono = produtores[imoveis.index(imovel) % len(produtores)] if imovel.tipo == "rural" else cidadaos[imoveis.index(imovel) % len(cidadaos)]
            db.add(PessoaImovel(
                pessoa_id=dono.id, imovel_id=imovel.id, relacao="proprietario",
                principal=True, observacao="Vínculo criado pela carga de demonstração",
            ))
    return cidadaos, produtores, imoveis


async def _seed_frota(db, organizacao_id: uuid.UUID) -> tuple[list[Maquina], list[Veiculo]]:
    categorias_dados = [
        ("retroescavadeira", "Retroescavadeira", "C", None, 14),
        ("pag_carregadeira", "Pá carregadeira", "C", None, 16),
        ("motoniveladora", "Motoniveladora", "C", None, 18),
        ("escavadeira_hidraulica", "Escavadeira hidráulica", "C", "Curso de operação", 20),
        ("trator", "Trator agrícola", "B", None, 10),
        ("caminhao_cacamba", "Caminhão (caçamba)", "C", None, 10),
    ]
    categorias: dict[str, CategoriaMaquina] = {}
    for chave, nome, cnh, curso, consumo in categorias_dados:
        existente = await _procurar(db, CategoriaMaquina, organizacao_id=organizacao_id, chave=chave)
        if existente is None:
            existente = CategoriaMaquina(
                organizacao_id=organizacao_id, chave=chave, nome=nome,
                exige_cnh_categoria=cnh, exige_curso=curso,
                consumo_medio_litros_hora=consumo, ativo=True,
            )
            db.add(existente)
            await db.flush()
        categorias[chave] = existente

    maquinas: list[Maquina] = []
    dados_maquinas = [
        ("M-001", "retroescavadeira", "Retro 425", "JCB", "3CX", 2020, 1840),
        ("M-002", "pag_carregadeira", "Pá 950", "Caterpillar", "950G", 2019, 2210),
        ("M-003", "motoniveladora", "Moto 140", "New Holland", "RG140B", 2021, 1750),
        ("M-004", "escavadeira_hidraulica", "Escavadeira 210", "Komatsu", "PC210", 2018, 3120),
    ]
    for codigo, cat_chave, nome, marca, modelo, ano, horimetro in dados_maquinas:
        existente = await _procurar(db, Maquina, organizacao_id=organizacao_id, codigo=codigo)
        if existente is None:
            existente = Maquina(
                organizacao_id=organizacao_id, codigo=codigo, patrimonio=f"PAT-M{ano % 100}{codigo[-1]}",
                categoria_id=categorias[cat_chave].id, nome=nome, marca=marca, modelo=modelo,
                ano=ano, horimetro_atual=horimetro, tipo_combustivel="diesel_s10",
                capacidade_tanque_litros=200, consumo_medio_litros_hora=15,
                localizacao_atual="Pátio da Secretaria", data_aquisicao=date(ano, 5, 15),
                valor_aquisicao=450000, situacao=SituacaoEquipamento.DISPONIVEL.value,
            )
            db.add(existente)
            await db.flush()
        maquinas.append(existente)

    veiculos: list[Veiculo] = []
    dados_veiculos = [
        ("V-001", "AAA1A01", "Caminhão basculante 6m³", "Mercedes-Benz", "1113", 2016, "caminhao_basculante"),
        ("V-002", "BBB2B02", "Caminhão para caçamba 8t", "Volkswagen", "15-180", 2018, "caminhao_cacamba"),
        ("V-003", "CCC3C03", "Caminhão para caçamba 8t", "Ford", "Cargo 1519", 2020, "caminhao_cacamba"),
        ("V-004", "DDD4D04", "Caminhonete de apoio", "Toyota", "Hilux", 2021, "veiculo_apoio"),
    ]
    for codigo, placa, nome, marca, modelo, ano, tipo in dados_veiculos:
        existente = await _procurar(db, Veiculo, organizacao_id=organizacao_id, codigo=codigo)
        if existente is None:
            existente = Veiculo(
                organizacao_id=organizacao_id, codigo=codigo, placa=placa,
                renavam=str(random.randint(10000000000, 99999999999)),
                nome=nome, marca=marca, modelo=modelo, ano=ano, tipo=tipo,
                tipo_carroceria="basculante" if "basculante" in tipo else "porta-caçamba",
                capacidade="8 t", transporta_cacamba=(tipo == "caminhao_cacamba"),
                odometro_atual=random.randint(40000, 180000),
                tipo_combustivel="diesel_s10", capacidade_tanque_litros=250,
                consumo_medio_km_litro=3.2, data_aquisicao=date(ano, 3, 1),
                licenciamento_ate=date.today() + timedelta(days=random.randint(30, 300)),
                seguro_ate=date.today() + timedelta(days=random.randint(30, 300)),
                localizacao_atual="Pátio da Secretaria", situacao=SituacaoEquipamento.DISPONIVEL.value,
            )
            db.add(existente)
            await db.flush()
        veiculos.append(existente)
    return maquinas, veiculos


async def _seed_habilitacoes(db, organizacao_id: uuid.UUID, usuarios: dict[str, User], maquinas: list[Maquina]) -> list[Habilitacao]:
    habilitacoes: list[Habilitacao] = []
    dados = [
        ("operador", "operador", "Operador de máquinas", True, "C", ["retroescavadeira", "pag_carregadeira", "motoniveladora"]),
        ("operador2", "operador", "Operador de máquinas II", True, "C", ["escavadeira_hidraulica", "retroescavadeira"]),
        ("operador3", "operador", "Operador de máquinas III", True, "C", ["trator", "motoniveladora"]),
        ("motorista", "motorista", "Motorista", False, "C", ["caminhao_cacamba"]),
        ("motorista2", "motorista", "Motorista II", False, "C", ["caminhao_cacamba", "caminhao_basculante"]),
    ]
    for externo, perfil_base, funcao, opera, cnh_cat, autorizadas in dados:
        usuario = usuarios.get(externo)
        if usuario is None:
            usuario = User(
                organizacao_id=organizacao_id, externo_id=f"demo-{externo}",
                nome=funcao, email=f"{externo}@demo.local", perfil=perfil_base, ativo=True,
            )
            db.add(usuario)
            await db.flush()
        existente = await _procurar(db, Habilitacao, organizacao_id=organizacao_id, user_id=usuario.id)
        if existente is None:
            existente = Habilitacao(
                organizacao_id=organizacao_id, user_id=usuario.id, funcao=funcao,
                cnh_numero=str(random.randint(10000000000, 99999999999)),
                cnh_categoria=cnh_cat, cnh_validade=date.today() + timedelta(days=400),
                categorias_autorizadas=autorizadas,
                maquinas_autorizadas=[m.codigo for m in maquinas] if opera else [],
                veiculos_autorizados=[] if opera else ["caminhao_cacamba"],
                opera_maquinas=opera, dirige_veiculos=not opera,
                jornada_inicio="07:00", jornada_fim="17:00", jornada_maxima_horas=8,
                escala="seg-sex", situacao="ativa",
            )
            db.add(existente)
            await db.flush()
        habilitacoes.append(existente)
    return habilitacoes


async def _seed_tipos_servico(db, organizacao_id: uuid.UUID) -> dict[str, TipoServico]:
    tipos: dict[str, TipoServico] = {}
    for chave, nome, categorias, exige_vistoria, horas, consumo in SERVICOS:
        existente = await _procurar(db, TipoServico, organizacao_id=organizacao_id, chave=chave)
        if existente is None:
            existente = TipoServico(
                organizacao_id=organizacao_id, chave=chave, nome=nome,
                categorias_compativeis=categorias, exige_vistoria=exige_vistoria,
                exige_aprovacao_especial=False, horas_medias=horas,
                consumo_medio_litros=consumo, usa_banco_horas=True,
                permite_caminhoes=True, ativo=True,
            )
            db.add(existente)
            await db.flush()
        tipos[chave] = existente
    return tipos


async def _seed_programa(db, organizacao_id: uuid.UUID) -> Programa:
    existente = await _procurar(db, Programa, organizacao_id=organizacao_id, chave="porteira_adentro_2026")
    if existente is not None:
        return existente
    programa = Programa(
        organizacao_id=organizacao_id,
        chave="porteira_adentro_2026",
        nome="Porteira Adentro 2026",
        descricao="Apoio à mecanização da agricultura familiar com máquinas municipais.",
        base_legal="Lei Municipal de Demonstração — não representa limite legal fixo.",
        vigencia_inicio=date.today() - timedelta(days=60),
        vigencia_fim=date.today() + timedelta(days=300),
        horas_por_beneficiario=24, horas_por_propriedade=16,
        regra_limite="ambos", metodo_desconto=MetodoDesconto.GERAL.value,
        validade_saldo_dias=365, permite_horas_adicionais=True,
        limite_horas_adicionais=8, exige_vistoria=True, exige_aprovacao_gestor=True,
        permite_cobranca=False, valor_hora_excedente=0,
        documentos_obrigatorios=["Comprovante de atividade rural", "Documento da propriedade"],
        servicos_permitidos=["manutencao_estrada", "cascalhamento", "terraplanagem", "limpeza_area",
                             "abertura_valas", "construcao_acude", "curva_nivel", "transporte_terra"],
        equipamentos_permitidos=["retroescavadeira", "pag_carregadeira", "motoniveladora", "trator", "caminhao_cacamba"],
        criterios_prioridade=["menor saldo", "menor renda", "primeira solicitação"],
        ativo=True,
    )
    db.add(programa)
    await db.flush()
    return programa


async def _seed_beneficiarios(db, organizacao_id: uuid.UUID, programa: Programa, produtores: list[Pessoa], imoveis: list[Imovel], usuarios: dict[str, User]) -> list[Beneficiario]:
    beneficiarios: list[Beneficiario] = []
    rurais = [im for im in imoveis if im.tipo == "rural"]
    for pessoa, imovel in zip(produtores, rurais):
        existente = await _procurar(db, Beneficiario, organizacao_id=organizacao_id, pessoa_id=pessoa.id, programa_id=programa.id)
        if existente is None:
            existente = Beneficiario(
                organizacao_id=organizacao_id, programa_id=programa.id, pessoa_id=pessoa.id,
                classificacao="produtor_rural", atividade_produtiva=pessoa.observacoes or "Agricultura familiar",
                data_entrada=date.today() - timedelta(days=45),
                validade_ate=programa.vigencia_fim, situacao=SituacaoBeneficiario.ATIVO.value,
            )
            db.add(existente)
            await db.flush()
            saldo = await banco_horas.obter_ou_criar_saldo(
                db, organizacao_id=organizacao_id, programa=programa,
                beneficiario=existente, imovel_id=imovel.id,
            )
            await banco_horas.conceder(
                db, saldo, quantidade=24.0,
                usuario_id=usuarios["gestor"].id,
                motivo="Concessão inicial do programa (carga de demonstração)",
            )
            print(f"  • saldo concedido: {pessoa.nome} — 24h")
        beneficiarios.append(existente)
    return beneficiarios


async def _seed_solicitacoes_cacamba(
    db, organizacao_id: uuid.UUID, usuarios: dict[str, User],
    cidadaos: list[Pessoa], imoveis: list[Imovel], regioes: dict[str, Regiao],
    residuos: dict[str, TipoResiduo], cacambas: list[Cacamba],
) -> list[SolicitacaoCacamba]:
    estados = [
        ("pendente", None, None),
        ("em_analise", None, None),
        ("aprovada", None, None),
        ("agendada", cacambas[0], date.today() + timedelta(days=2)),
        ("aguardando_entrega", cacambas[1], date.today() + timedelta(days=1)),
        ("em_uso", cacambas[2], date.today() - timedelta(days=3)),
        ("aguardando_retirada", cacambas[3], date.today() - timedelta(days=5)),
        ("concluida", None, None),
    ]
    criadas: list[SolicitacaoCacamba] = []
    hoje = date.today()
    for indice, (situacao, cacamba, data_agendada) in enumerate(estados):
        pessoa = cidadaos[indice % len(cidadaos)]
        imovel = imoveis[indice % len(imoveis)]
        numero, ano, protocolo_formatado = await protocolo.protocolo_solicitacao_cacamba(db, organizacao_id)
        data_desejada = hoje + timedelta(days=indice + 1)
        prevista_entrega = data_agendada or (data_desejada if situacao in ("concluida",) else data_desejada + timedelta(days=1))
        prevista_retirada = (prevista_entrega + timedelta(days=3)) if prevista_entrega else None
        solicitacao = SolicitacaoCacamba(
            organizacao_id=organizacao_id, ano=ano, protocolo=numero,
            protocolo_formatado=protocolo_formatado,
            pessoa_id=pessoa.id, imovel_id=imovel.id,
            logradouro=pessoa.logradouro, numero=pessoa.numero, bairro=pessoa.bairro,
            referencia="Portão principal", regiao_id=imovel.regiao_id,
            endereco_chave=f"{pessoa.logradouro}|{pessoa.numero}|{pessoa.bairro}".lower(),
            instrucoes_entrega="Deixar a caçamba no passeio, com o lado de abertura para a rua.",
            espaco_confirmado=True, acesso_caminhao_confirmado=True,
            exige_autorizacao_especial=False,
            tipo_residuo_id=residuos["entulho"].id, descricao_material="Entulho de reforma residencial",
            quantidade_estimada_m3=3.0, origem_material="Reforma residencial",
            ciente_itens_proibidos=True, prioridade=Prioridade.NORMAL.value,
            data_desejada=data_desejada, data_agendada=data_agendada,
            data_prevista_entrega=prevista_entrega,
            data_prevista_retirada=prevista_retirada,
            dias_previstos=3, cacamba_id=cacamba.id if cacamba else None,
            veiculo_id=None, equipe="Equipe A", atendente_id=usuarios["atendente"].id,
            situacao=situacao, termo_aceito=True, created_by_id=usuarios["atendente"].id,
        )
        db.add(solicitacao)
        await db.flush()
        criadas.append(solicitacao)

    # Sincroniza a situação das caçambas com o estado das solicitações para
    # que o painel mostre dados realistas (caçamba vinculada a solicitação
    # ativa sai de "disponível").
    mapa_situacao = {
        "agendada": SituacaoCacamba.RESERVADA.value,
        "aguardando_entrega": SituacaoCacamba.AGUARDANDO_ENTREGA.value,
        "em_transporte": SituacaoCacamba.EM_TRANSPORTE_ENTREGA.value,
        "em_uso": SituacaoCacamba.EM_USO.value,
        "aguardando_retirada": SituacaoCacamba.AGUARDANDO_RETIRADA.value,
        "em_retirada": SituacaoCacamba.EM_TRANSPORTE_RETORNO.value,
    }
    for solicitacao in criadas:
        if solicitacao.cacamba_id and solicitacao.situacao in mapa_situacao:
            cacamba = await db.get(Cacamba, solicitacao.cacamba_id)
            if cacamba is not None:
                cacamba.situacao = mapa_situacao[solicitacao.situacao]
                cacamba.localizacao_atual = (
                    f"{solicitacao.logradouro}, {solicitacao.numero} — {solicitacao.bairro}"
                    if solicitacao.situacao in ("em_uso", "aguardando_retirada")
                    else cacamba.localizacao_atual
                )
    return criadas


async def _seed_solicitacoes_servico(
    db, organizacao_id: uuid.UUID, usuarios: dict[str, User], programa: Programa,
    beneficiarios: list[Beneficiario], tipos: dict[str, TipoServico], imoveis: list[Imovel],
) -> list[SolicitacaoServico]:
    estados = [
        ("protocolada", "limpeza_area"),
        ("em_analise", "manutencao_estrada"),
        ("aguardando_vistoria", "construcao_acude"),
        ("vistoria_realizada", "terraplanagem"),
        ("aguardando_aprovacao", "cascalhamento"),
        ("aprovada", "manutencao_estrada"),
        ("agendada", "abertura_valas"),
        ("em_execucao", "cascalhamento"),
        ("concluida", "limpeza_area"),
    ]
    criadas: list[SolicitacaoServico] = []
    hoje = date.today()
    for indice, (situacao, chave_tipo) in enumerate(estados):
        beneficiario = beneficiarios[indice % len(beneficiarios)]
        imovel = imoveis[indice % len(imoveis)]
        tipo = tipos[chave_tipo]
        numero, ano, protocolo_formatado = await protocolo.protocolo_servico(db, organizacao_id)
        horas = float(tipo.horas_medias or 4)
        solicitacao = SolicitacaoServico(
            organizacao_id=organizacao_id, ano=ano, protocolo=numero,
            protocolo_formatado=protocolo_formatado,
            programa_id=programa.id, beneficiario_id=beneficiario.id,
            imovel_id=imovel.id, tipo_servico_id=tipo.id,
            descricao=(
                f"Serviço de {tipo.nome.lower()} na propriedade {imovel.nome} — "
                "dados fictícios de demonstração."
            ),
            motivo="Necessidade de manutenção da propriedade rural",
            dimensoes_estimadas="40 m lineares", quantidade_material="12 m³ de cascalho",
            horas_estimadas=horas, horas_autorizadas=horas,
            maquinas_sugeridas=tipo.categorias_compativeis or [],
            veiculos_sugeridos=["caminhao_cacamba"] if tipo.permite_caminhoes else [],
            data_desejada=hoje + timedelta(days=indice + 3),
            data_agendada=(hoje + timedelta(days=indice + 5)) if situacao in ("agendada", "em_execucao") else None,
            prioridade=Prioridade.NORMAL.value, situacao=situacao,
            observacoes="Solicitação da carga de demonstração",
            created_by_id=usuarios["atendente"].id,
        )
        db.add(solicitacao)
        await db.flush()
        if situacao in ("aprovada", "agendada", "em_execucao", "concluida"):
            solicitacao.aprovado_por_id = usuarios["gestor"].id
            solicitacao.aprovado_em = hoje - timedelta(days=2)
        criadas.append(solicitacao)
    return criadas


async def _seed_ordens(
    db, organizacao_id: uuid.UUID, usuarios: dict[str, User],
    solicitacoes_servico: list[SolicitacaoServico], maquinas: list[Maquina],
    veiculos: list[Veiculo], tipos: dict[str, TipoServico],
) -> list[OrdemServico]:
    ordens: list[OrdemServico] = []
    aprovadas = [s for s in solicitacoes_servico if s.situacao in ("agendada", "em_execucao", "concluida")]
    for solicitacao in aprovadas[:2]:
        numero, ano, numero_formatado = await protocolo.numero_ordem(db, organizacao_id)
        situacao = "em_execucao" if solicitacao.situacao == "em_execucao" else "emitida"
        ordem = OrdemServico(
            organizacao_id=organizacao_id, ano=ano, numero=numero,
            numero_formatado=numero_formatado, solicitacao_id=solicitacao.id,
            token_consulta=token_consulta(),
            data_prevista=solicitacao.data_agendada or date.today() + timedelta(days=3),
            hora_prevista_inicio="07:30", hora_prevista_fim="15:30",
            horas_autorizadas=solicitacao.horas_autorizadas,
            viagens_previstas=4, combustivel_previsto_litros=120,
            materiais="Cascalho e brita", orientacoes="Executar conforme vistoria.",
            horas_produtivas=0, horas_paradas=0, horas_deslocamento=0,
            horas_totais=0, horas_descontadas=0, horas_nao_descontadas=0,
            diesel_consumido_litros=0, viagens_realizadas=0,
            servico_realizado=None, situacao=situacao, aprovada_por_id=usuarios["gestor"].id,
        )
        db.add(ordem)
        await db.flush()
        if situacao == "em_execucao":
            ordem.iniciada_em = datetime.now(timezone.utc) - timedelta(hours=3)
            ordem.horas_produtivas = 2.5
            ordem.horas_totais = 3
            ordem.diesel_consumido_litros = 40
        ordens.append(ordem)
    return ordens


async def _seed_combustivel(db, organizacao_id: uuid.UUID, maquinas: list[Maquina], veiculos: list[Veiculo], usuarios: dict[str, User], ordens: list[OrdemServico]) -> None:
    existente = await _procurar(db, Tanque, organizacao_id=organizacao_id, codigo="TQ-01")
    if existente is None:
        existente = Tanque(
            organizacao_id=organizacao_id, codigo="TQ-01", nome="Tanque do pátio",
            tipo_combustivel="diesel_s10", local="Pátio da Secretaria",
            capacidade_litros=5000, estoque_atual_litros=3200,
            estoque_minimo_litros=800, bombas=["Bomba 1", "Bomba 2"], ativo=True,
        )
        db.add(existente)
        await db.flush()
    from app.services import combustivel as servico_combustivel

    ordem = ordens[0] if ordens else None
    maquina = maquinas[0]
    existente_abastecimento = await _procurar(db, Abastecimento, organizacao_id=organizacao_id, requisicao="REQ-DEMO-001")
    if existente_abastecimento is None:
        await servico_combustivel.movimentar_estoque(
            db, existente.id, tipo=TipoMovimentoCombustivel.SAIDA, litros=80, usuario_id=usuarios["combustivel"].id,
            fornecedor=None, motivo="Abastecimento",
        )
        abastecimento = Abastecimento(
            organizacao_id=organizacao_id, abastecido_em=datetime.now(timezone.utc) - timedelta(days=1),
            maquina_id=maquina.id, responsavel_id=usuarios["combustivel"].id,
            operador_id=usuarios["operador"].id, quantidade_litros=80,
            tipo_combustivel="diesel_s10", valor_unitario=6.2, valor_total=496,
            horimetro=maquina.horimetro_atual - 5, tanque_id=existente.id,
            bomba="Bomba 1", local="Pátio da Secretaria", requisicao="REQ-DEMO-001",
            ordem_id=ordem.id if ordem else None, observacoes="Carga de demonstração",
        )
        db.add(abastecimento)
        await db.flush()
    print("  • tanque e abastecimento de demonstração criados")


async def _seed_manutencoes(db, organizacao_id: uuid.UUID, maquinas: list[Maquina], usuarios: dict[str, User]) -> None:
    existente_plano = await _procurar(db, PlanoManutencao, organizacao_id=organizacao_id, nome="Preventiva 250h")
    maquina = maquinas[0]
    if existente_plano is None:
        existente_plano = PlanoManutencao(
            organizacao_id=organizacao_id, nome="Preventiva 250h",
            descricao="Revisão preventiva a cada 250 horas de trabalho.",
            maquina_id=maquina.id, base_gatilho="horimetro",
            intervalo_horas=250, antecedencia_alerta_dias=15,
            antecedencia_alerta_medidor=20, ultima_medicao=maquina.horimetro_atual - 250,
            proxima_medicao=maquina.horimetro_atual, servicos_previstos=["Troca de óleo", "Filtros", "Lubrificação"],
            recomendacao_fabricante="Revisão conforme manual do fabricante", ativo=True,
        )
        db.add(existente_plano)
        await db.flush()

    existente = await _procurar(db, Manutencao, organizacao_id=organizacao_id, maquina_id=maquinas[1].id, tipo="preventiva")
    if existente is None:
        existente = Manutencao(
            organizacao_id=organizacao_id, plano_id=None, maquina_id=maquinas[1].id,
            tipo="preventiva", data_abertura=date.today() - timedelta(days=6),
            defeito="Revisão periódica programada",
            diagnostico="Sem defeitos aparentes; revisão de rotina.",
            prioridade="normal", horimetro=maquinas[1].horimetro_atual,
            servicos="Troca de óleo; Filtros", pecas=[{"nome": "Óleo 15W40", "quantidade": 2}],
            oficina="Oficina municipal", custo_pecas=480, custo_servicos=320,
            custo_total=800, data_prevista=date.today() + timedelta(days=1),
            situacao="aberta", situacao_anterior_equipamento="disponivel",
            responsavel_id=usuarios["manutencao"].id,
            observacoes="Manutenção da carga de demonstração",
        )
        db.add(existente)
        await db.flush()
    print("  • plano e manutenção de demonstração criados")


async def principal() -> None:
    print("\nGovInfra — carga de demonstração\n")
    async with async_session() as db:
        organizacao, usuarios = await _seed_organizacao(db)
        regioes = await _seed_regioes(db, organizacao.id)
        await _seed_motivos(db, organizacao.id)
        residuos = await _seed_residuos(db, organizacao.id)
        cacambas = await _seed_cacambas(db, organizacao.id)
        cidadaos, produtores, imoveis = await _seed_pessoas(db, organizacao.id, regioes)
        maquinas, veiculos = await _seed_frota(db, organizacao.id)
        await _seed_habilitacoes(db, organizacao.id, usuarios, maquinas)
        tipos = await _seed_tipos_servico(db, organizacao.id)
        programa = await _seed_programa(db, organizacao.id)
        beneficiarios = await _seed_beneficiarios(db, organizacao.id, programa, produtores, imoveis, usuarios)
        await _seed_solicitacoes_cacamba(db, organizacao.id, usuarios, cidadaos, imoveis, regioes, residuos, cacambas)
        solicitacoes_servico = await _seed_solicitacoes_servico(db, organizacao.id, usuarios, programa, beneficiarios, tipos, imoveis)
        ordens = await _seed_ordens(db, organizacao.id, usuarios, solicitacoes_servico, maquinas, veiculos, tipos)
        await _seed_combustivel(db, organizacao.id, maquinas, veiculos, usuarios, ordens)
        await _seed_manutencoes(db, organizacao.id, maquinas, usuarios)

        await db.commit()

    print("\nCarga de demonstração concluída.")
    print("Usuários de acesso (ponte de desenvolvimento):")
    print("  • admin.infra@demo.local — administrador")
    print("  • gestor.infra@demo.local — gestor")
    print("  • atendente@demo.local — atendente\n")


if __name__ == "__main__":
    asyncio.run(principal())
