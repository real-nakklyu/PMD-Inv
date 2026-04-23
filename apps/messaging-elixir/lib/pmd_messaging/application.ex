defmodule PmdMessaging.Application do
  use Application

  @impl true
  def start(_type, _args) do
    port = Application.fetch_env!(:pmd_messaging, :port)

    children = [
      {Registry, keys: :duplicate, name: PmdMessaging.Registry},
      {Bandit, plug: PmdMessaging.Router, scheme: :http, port: port}
    ]

    opts = [strategy: :one_for_one, name: PmdMessaging.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
