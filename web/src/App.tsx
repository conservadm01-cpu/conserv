import { useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { sessao, type Usuario } from './lib/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Carteira from './pages/Carteira';
import Pedidos from './pages/Pedidos';
import PedidoDetalhe from './pages/PedidoDetalhe';
import Producao from './pages/Producao';
import OrdemDetalhe from './pages/OrdemDetalhe';
import Materiais from './pages/Materiais';
import Estoque from './pages/Estoque';
import Compras from './pages/Compras';
import Produtos from './pages/Produtos';
import ProdutoDetalhe from './pages/ProdutoDetalhe';
import Clientes from './pages/Clientes';
import Cadastros from './pages/Cadastros';
import Relatorios from './pages/Relatorios';
import Importacao from './pages/Importacao';
import Engenharia from './pages/Engenharia';
import Colaboradores from './pages/Colaboradores';
import Apontamento from './pages/Apontamento';
import Custos from './pages/Custos';
import Canal from './pages/Canal';

const MENU = [
  {
    grupo: 'Visão geral',
    itens: [
      { para: '/', rotulo: 'Painel', icone: '▤', fim: true },
      { para: '/carteira', rotulo: 'Carteira', icone: '☰' },
      { para: '/relatorios', rotulo: 'Relatórios', icone: '◔' },
      { para: '/custos', rotulo: 'Formação de custo', icone: '⛁' },
    ],
  },
  {
    grupo: 'Processos',
    itens: [
      { para: '/producao', rotulo: 'Produção (PCP)', icone: '⚙' },
      { para: '/pedidos', rotulo: 'Pedidos', icone: '✎' },
      { para: '/apontamento', rotulo: 'Apontamento', icone: '⏱' },
    ],
  },
  {
    grupo: 'Materiais',
    itens: [
      { para: '/estoque', rotulo: 'Estoque', icone: '▦' },
      { para: '/compras', rotulo: 'Necessidade de compra', icone: '↯' },
      { para: '/materiais', rotulo: 'Cadastro de materiais', icone: '◧' },
    ],
  },
  {
    grupo: 'Engenharia',
    itens: [
      { para: '/engenharia', rotulo: 'Fábrica e custos', icone: '⚒' },
      { para: '/colaboradores', rotulo: 'Colaboradores', icone: '☺' },
    ],
  },
  {
    grupo: 'Cadastros',
    itens: [
      { para: '/produtos', rotulo: 'Produtos e ficha técnica', icone: '◫' },
      { para: '/clientes', rotulo: 'Clientes', icone: '⌂' },
      { para: '/cadastros', rotulo: 'Tabelas auxiliares', icone: '≡' },
      { para: '/importacao', rotulo: 'Importar planilha', icone: '⇪' },
    ],
  },
  {
    grupo: 'Pessoas',
    itens: [
      { para: '/canal', rotulo: 'Conversa aberta', icone: '✉' },
    ],
  },
];

function Layout({ usuario, aoSair }: { usuario: Usuario; aoSair: () => void }) {
  return (
    <nav className="menu">
      <div className="menu-marca">
        <strong>CONSERV</strong>
        <span>Materiais e processos</span>
      </div>
      <div className="menu-lista">
        {MENU.map((secao) => (
          <div key={secao.grupo}>
            <div className="menu-grupo">{secao.grupo}</div>
            {secao.itens.map((item) => (
              <NavLink
                key={item.para}
                to={item.para}
                end={item.fim}
                className={({ isActive }) => `menu-item${isActive ? ' ativo' : ''}`}
              >
                <span className="icone">{item.icone}</span>
                {item.rotulo}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="menu-rodape">
        <b>{usuario.nome}</b>
        <span>{usuario.perfil}</span>
        <button onClick={aoSair}>Sair</button>
      </div>
    </nav>
  );
}

function Area({ usuario, aoSair }: { usuario: Usuario; aoSair: () => void }) {
  const navegar = useNavigate();
  const sair = () => {
    aoSair();
    navegar('/login');
  };
  return (
    <div className="app">
      <Layout usuario={usuario} aoSair={sair} />
      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/carteira" element={<Carteira />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/producao" element={<Producao />} />
          <Route path="/producao/:id" element={<OrdemDetalhe />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/materiais" element={<Materiais />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route path="/produtos/:id" element={<ProdutoDetalhe />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="/importacao" element={<Importacao />} />
          <Route path="/engenharia" element={<Engenharia />} />
          <Route path="/colaboradores" element={<Colaboradores />} />
          <Route path="/apontamento" element={<Apontamento />} />
          <Route path="/custos" element={<Custos />} />
          <Route path="/canal" element={<Canal />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(() => sessao.usuario());

  const sair = () => {
    sessao.sair();
    setUsuario(null);
  };

  return (
    <HashRouter>
      {usuario ? (
        <Area usuario={usuario} aoSair={sair} />
      ) : (
        <Routes>
          <Route path="*" element={<Login aoEntrar={setUsuario} />} />
        </Routes>
      )}
    </HashRouter>
  );
}
