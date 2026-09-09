FROM grafana/tempo:3.0.2 AS config-verify

COPY tempo.yaml /etc/tempo/tempo.yaml
COPY overrides.yaml /etc/tempo/overrides.yaml
ENV TEMPO_STORAGE_CONTAINER=traces
ENV AZURE_STORAGE_ACCOUNT=truyntempoverify
ENV AZURE_CLIENT_ID=00000000-0000-0000-0000-000000000000
RUN ["/tempo", "-config.file=/etc/tempo/tempo.yaml", "-config.expand-env=true", "-config.verify"]

FROM grafana/tempo:3.0.2

COPY tempo.yaml /etc/tempo/tempo.yaml
COPY overrides.yaml /etc/tempo/overrides.yaml

ENTRYPOINT ["/tempo"]
CMD ["-config.file=/etc/tempo/tempo.yaml", "-config.expand-env=true"]
