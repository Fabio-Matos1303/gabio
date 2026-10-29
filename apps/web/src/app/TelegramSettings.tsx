import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AppGateway,
  TelegramConnection,
  TelegramPairing,
} from "../lib/app-gateway.js";

type Notice = { kind: "success" | "error"; text: string } | null;

export function TelegramSettings({ gateway }: { gateway: AppGateway }) {
  const [connection, setConnection] = useState<TelegramConnection | null>(null);
  const [pairing, setPairing] = useState<TelegramPairing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const botUsername =
    import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConnection(await gateway.getTelegramConnection());
    } catch {
      setNotice({
        kind: "error",
        text: "Não foi possível consultar o Telegram.",
      });
    } finally {
      setLoading(false);
    }
  }, [gateway]);

  useEffect(() => {
    void load();
  }, [load]);

  const deepLink = useMemo(
    () =>
      pairing && botUsername
        ? `https://t.me/${botUsername}?start=${pairing.code}`
        : null,
    [botUsername, pairing],
  );

  async function requestPairing() {
    setBusy(true);
    setNotice(null);
    try {
      setPairing(await gateway.requestTelegramPairing());
    } catch {
      setNotice({
        kind: "error",
        text: "Não foi possível gerar o vínculo. Aguarde e tente novamente.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setNotice(null);
    try {
      await gateway.revokeTelegramConnection();
      setConnection(null);
      setPairing(null);
      setNotice({ kind: "success", text: "Telegram desconectado." });
    } catch {
      setNotice({ kind: "error", text: "Não foi possível desconectar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="settings-card telegram-settings">
      <div className="settings-card-heading">
        <div>
          <p className="eyebrow">Integrações</p>
          <h2>Telegram</h2>
        </div>
        <span className={`connection-status ${connection ? "connected" : ""}`}>
          {loading ? "Consultando" : connection ? "Conectado" : "Desconectado"}
        </span>
      </div>
      <p className="muted">
        Envie informações pelo bot em uma conversa privada. O vínculo é
        individual para proteger dados da residência.
      </p>
      {notice && (
        <p
          className={`notice ${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}
      {connection ? (
        <div className="telegram-connected">
          <p>
            Vinculado em{" "}
            <strong>
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "America/Bahia",
              }).format(new Date(connection.linkedAt))}
            </strong>
          </p>
          <p className="setup-note">
            Comando disponível: <code>/tarefa comprar pão</code>
          </p>
          <button
            className="danger-button"
            type="button"
            disabled={busy}
            onClick={() => void revoke()}
          >
            Desconectar Telegram
          </button>
        </div>
      ) : pairing ? (
        <div className="telegram-pairing">
          <p>Este vínculo expira em dez minutos e funciona uma única vez.</p>
          {deepLink ? (
            <a
              className="primary-button telegram-open-button"
              href={deepLink}
              target="_blank"
              rel="noreferrer"
            >
              Abrir bot no Telegram
            </a>
          ) : (
            <div className="pairing-code">
              <span>Código temporário</span>
              <code>{pairing.code}</code>
              <small>
                Configure VITE_TELEGRAM_BOT_USERNAME para gerar o link direto.
              </small>
            </div>
          )}
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => void requestPairing()}
          >
            Gerar outro vínculo
          </button>
        </div>
      ) : (
        <button
          className="primary-button"
          type="button"
          disabled={busy || loading}
          onClick={() => void requestPairing()}
        >
          {busy ? "Gerando…" : "Conectar Telegram"}
        </button>
      )}
    </article>
  );
}
