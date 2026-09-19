import InstallModal from "./InstallModal";
import { useInstall } from "../game/install";

/**
 * Convite único para instalar o app, a partir da segunda sessão: quem fechou o
 * jogo e voltou já mostrou que pretende jogar de novo. Fechar dispensa para
 * sempre — o link no rodapé fica para quem mudar de ideia.
 */
export default function InstallInvite() {
  const { shouldInvite, dismissInvite } = useInstall();
  if (!shouldInvite) return null;
  return (
    <InstallModal
      onClose={dismissInvite}
      footer={
        <button onClick={dismissInvite} className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300">
          Agora não
        </button>
      }
    />
  );
}
