defmodule PmdMessaging.MixProject do
  use Mix.Project

  def project do
    [
      app: :pmd_messaging,
      version: "0.1.0",
      elixir: "~> 1.16",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      releases: [
        pmd_messaging: [
          include_executables_for: [:unix],
          applications: [runtime_tools: :permanent]
        ]
      ]
    ]
  end

  def application do
    [
      extra_applications: [:logger, :runtime_tools],
      mod: {PmdMessaging.Application, []}
    ]
  end

  defp deps do
    [
      {:bandit, "~> 1.6"},
      {:jason, "~> 1.4"},
      {:plug, "~> 1.16"},
      {:req, "~> 0.5"},
      {:websock, "~> 0.5"},
      {:websock_adapter, "~> 0.5"}
    ]
  end
end
