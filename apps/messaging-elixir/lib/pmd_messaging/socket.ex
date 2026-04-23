defmodule PmdMessaging.Socket do
  @behaviour WebSock

  require Logger

  @impl true
  def init(%{token: token}) when is_binary(token) and byte_size(token) > 10 do
    case PmdMessaging.Supabase.user_from_token(token) do
      {:ok, user} ->
        {:ok, %{user: user, joined_threads: MapSet.new()}}

      {:error, reason} ->
        Logger.warning("Rejected messaging socket: #{inspect(reason)}")
        {:stop, :unauthorized}
    end
  end

  def init(_args), do: {:stop, :missing_token}

  @impl true
  def handle_in({payload, [opcode: :text]}, state) do
    with {:ok, event} <- Jason.decode(payload),
         {:ok, state} <- handle_event(event, state) do
      {:ok, state}
    else
      {:reply, :ok, {:text, Jason.encode!(%{type: "error", message: "Invalid realtime message."})}, state}
    end
  end

  @impl true
  def handle_info({:broadcast, payload}, state) do
    {:push, {:text, Jason.encode!(payload)}, state}
  end

  defp handle_event(%{"type" => "join_thread", "thread_id" => thread_id}, state) do
    with {:ok, _membership} <- PmdMessaging.Supabase.ensure_thread_member(thread_id, state.user["id"]) do
      Registry.register(PmdMessaging.Registry, {:thread, thread_id}, %{user_id: state.user["id"]})
      {:ok, %{state | joined_threads: MapSet.put(state.joined_threads, thread_id)}}
    end
  end

  defp handle_event(%{"type" => "send_message", "thread_id" => thread_id, "body" => body} = event, state) do
    temp_id = event["temp_id"]

    with true <- MapSet.member?(state.joined_threads, thread_id),
         {:ok, _membership} <- PmdMessaging.Supabase.ensure_thread_member(thread_id, state.user["id"]),
         {:ok, message} <- PmdMessaging.Supabase.create_message(thread_id, state.user, body || "") do
      payload = %{type: "message_created", message: message}
      broadcast(thread_id, payload)
      {:reply, :ok, {:text, Jason.encode!(Map.merge(payload, %{type: "message_sent", temp_id: temp_id}))}, state}
    else
      _ ->
        {:reply, :ok, {:text, Jason.encode!(%{type: "message_error", temp_id: temp_id, message: "Could not send message."})}, state}
    end
  end

  defp handle_event(_event, state), do: {:ok, state}

  defp broadcast(thread_id, payload) do
    Registry.dispatch(PmdMessaging.Registry, {:thread, thread_id}, fn entries ->
      for {pid, _meta} <- entries, pid != self() do
        send(pid, {:broadcast, payload})
      end
    end)
  end
end
