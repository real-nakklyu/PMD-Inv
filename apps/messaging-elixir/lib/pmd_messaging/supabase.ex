defmodule PmdMessaging.Supabase do
  def user_from_token(token) do
    url = "#{supabase_url()}/auth/v1/user"

    case Req.get(url, headers: auth_headers(token)) do
      {:ok, %{status: 200, body: user}} ->
        profile = profile_for(user["id"])
        if profile, do: {:ok, Map.merge(user, %{"profile" => profile})}, else: {:error, :no_staff_profile}

      {:ok, response} ->
        {:error, {:auth_failed, response.status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  def ensure_thread_member(thread_id, user_id) do
    params = %{
      "select" => "*",
      "thread_id" => "eq.#{thread_id}",
      "user_id" => "eq.#{user_id}",
      "deleted_at" => "is.null",
      "limit" => "1"
    }

    case rest_get("message_thread_members", params) do
      {:ok, [membership | _]} -> {:ok, membership}
      {:ok, []} -> {:error, :not_thread_member}
      error -> error
    end
  end

  def create_message(thread_id, user, body) do
    payload = %{
      thread_id: thread_id,
      sender_id: user["id"],
      body: String.trim(body || "")
    }

    with {:ok, [message | _]} <- rest_insert("messages", payload),
         :ok <- restore_direct_thread_members(thread_id),
         :ok <- touch_thread(thread_id),
         :ok <- mark_read(thread_id, user["id"]) do
      {:ok,
       Map.merge(message, %{
         "sender" => user["profile"],
         "attachments" => [],
         "is_mine" => false
       })}
    end
  end

  defp restore_direct_thread_members(thread_id) do
    params = %{"select" => "thread_type", "id" => "eq.#{thread_id}", "limit" => "1"}

    with {:ok, [%{"thread_type" => "direct"} | _]} <- rest_get("message_threads", params),
         {:ok, _memberships} <-
           rest_patch("message_thread_members", %{"thread_id" => "eq.#{thread_id}"}, %{
             deleted_at: nil
           }) do
      :ok
    else
      {:ok, _group_or_missing} -> :ok
      _error -> :ok
    end
  end

  defp touch_thread(thread_id) do
    case rest_patch("message_threads", %{"id" => "eq.#{thread_id}"}, %{updated_at: DateTime.utc_now() |> DateTime.to_iso8601()}) do
      {:ok, _} -> :ok
      _ -> :ok
    end
  end

  defp mark_read(thread_id, user_id) do
    filters = %{"thread_id" => "eq.#{thread_id}", "user_id" => "eq.#{user_id}"}
    payload = %{last_read_at: DateTime.utc_now() |> DateTime.to_iso8601()}

    case rest_patch("message_thread_members", filters, payload) do
      {:ok, _} -> :ok
      _ -> :ok
    end
  end

  defp profile_for(user_id) do
    params = %{"select" => "id,full_name,role", "id" => "eq.#{user_id}", "limit" => "1"}

    case rest_get("profiles", params) do
      {:ok, [profile | _]} -> profile
      _ -> nil
    end
  end

  defp rest_get(table, params) do
    request(:get, rest_url(table), params: params)
  end

  defp rest_insert(table, payload) do
    request(:post, rest_url(table), json: payload, headers: [{"prefer", "return=representation"}])
  end

  defp rest_patch(table, filters, payload) do
    request(:patch, rest_url(table), params: filters, json: payload, headers: [{"prefer", "return=representation"}])
  end

  defp request(method, url, opts) do
    headers = Keyword.get(opts, :headers, [])
    opts = Keyword.put(opts, :headers, service_headers() ++ headers)

    case apply(Req, method, [url, opts]) do
      {:ok, %{status: status, body: body}} when status in 200..299 -> {:ok, body}
      {:ok, response} -> {:error, {:supabase_error, response.status, response.body}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp rest_url(table), do: "#{supabase_url()}/rest/v1/#{table}"

  defp auth_headers(token) do
    [
      {"apikey", service_role_key()},
      {"authorization", "Bearer #{token}"}
    ]
  end

  defp service_headers do
    [
      {"apikey", service_role_key()},
      {"authorization", "Bearer #{service_role_key()}"},
      {"content-type", "application/json"}
    ]
  end

  defp supabase_url do
    Application.fetch_env!(:pmd_messaging, :supabase_url) |> String.trim_trailing("/")
  end

  defp service_role_key do
    Application.fetch_env!(:pmd_messaging, :supabase_service_role_key)
  end
end
