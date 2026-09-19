import { useSwUpdate } from "../game/swUpdate";

/**
 * Aviso de versão nova. O service worker já trocou os arquivos em cache, mas
 * esta aba segue com o código antigo: recarregar é o que aplica a atualização.
 * Fica fora do caminho, ancorado no rodapé da tela.
 */
export default function UpdateBanner() {
  const { needRefresh, update } = useSwUpdate();
  if (!needRefresh) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/95 px-4 py-2.5 shadow-lg shadow-black/40">
        <span className="text-[13px] text-zinc-300">Nova versão disponível</span>
        <button onClick={update} className="btn-cta rounded px-3 py-1.5 text-[12px]">
          Atualizar
        </button>
      </div>
    </div>
  );
}
