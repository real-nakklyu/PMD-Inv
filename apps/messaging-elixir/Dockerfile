FROM hexpm/elixir:1.17.3-erlang-27.1.2-debian-bookworm-20241016-slim AS build

RUN apt-get update && apt-get install -y build-essential git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV MIX_ENV=prod

RUN mix local.hex --force && mix local.rebar --force
COPY mix.exs mix.lock* ./
RUN mix deps.get --only prod && mix deps.compile

COPY config ./config
COPY lib ./lib
RUN mix release

FROM debian:bookworm-slim AS app
RUN apt-get update && apt-get install -y openssl libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV MIX_ENV=prod
COPY --from=build /app/_build/prod/rel/pmd_messaging ./

CMD ["bin/pmd_messaging", "start"]
