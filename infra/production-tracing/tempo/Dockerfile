FROM grafana/tempo:3.0.2

COPY tempo.yaml /etc/tempo/tempo.yaml

ENTRYPOINT ["/tempo"]
CMD ["-config.file=/etc/tempo/tempo.yaml", "-config.expand-env=true"]
