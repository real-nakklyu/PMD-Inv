defmodule PmdMessaging.Router do
  use Plug.Router

  plug Plug.Logger
  plug :fetch_query_params
  plug :match
  plug :dispatch

  get "/health" do
    send_resp(conn, 200, Jason.encode!(%{status: "ok", service: "pmd-messaging"}))
  end

  get "/socket" do
    token = conn.query_params["token"]

    conn
    |> WebSockAdapter.upgrade(PmdMessaging.Socket, %{token: token}, timeout: 60_000)
    |> halt()
  end

  match _ do
    send_resp(conn, 404, "not found")
  end
end
