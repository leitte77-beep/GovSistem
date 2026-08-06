import { Link } from "react-router-dom";
import { textos } from "@/i18n/textos";
import { Botao } from "@/ui/Botao";

export default function NaoEncontrada() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl">{textos.estados.naoEncontradoTitulo}</h1>
      <p className="max-w-md text-sm text-ink-soft">{textos.estados.naoEncontradoDescricao}</p>
      <Link to="/inicio">
        <Botao variante="primario">{textos.nav.inicio}</Botao>
      </Link>
    </div>
  );
}
