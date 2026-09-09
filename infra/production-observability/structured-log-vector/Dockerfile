FROM timberio/vector:0.58.0-alpine

COPY vector.yaml /etc/vector/vector.yaml

ENTRYPOINT ["vector"]
CMD ["--config", "/etc/vector/vector.yaml"]
