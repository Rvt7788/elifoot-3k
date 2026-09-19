import { useEffect } from "react";
import InstallModal from "./InstallModal";
import { useInstall } from "../game/install";
import { track } from "../game/analytics";

/**
 * Convite único para instalar o app, a partir da segunda sessão: quem fechou o
 * jogo e voltou já mostrou que pretende jogar de novo. Fechar dispensa para
 * sempre — o link no rodapé fica para quem mudar de ideia.
 */
export default function InstallInvite() {
  const { shouldInvite, dismissInvite } = useInstall();

  // registra a exibição: sem ela não dá para medir quantos dos que viram
  // o convite acabaram instalando
  useEffect(() => {
    if (shouldInvite) track("install_prompt_shown");
  }, [shouldInvite]);

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
