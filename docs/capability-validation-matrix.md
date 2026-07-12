# Code2Lark Capability Validation Matrix

This matrix is the current human-readable fact source for target profile, delivery mode, host mode, local validation, deployment-test validation, and evidence state.

| Target | Delivery mode | Host mode | Local validation | Deployment-test validation | Notes |
| --- | --- | --- | --- | --- | --- |
| image-agent-web | Mode A | self-hosted / long connection | yes | yes | verified sample baseline |
| image-agent-web | Mode B | embedded host module | yes | yes | verified sample baseline |
| calendar-stock-updater | Mode A | embedded/adapter-first | yes | replay package + safe target validation | replay copy validated with `GET /api/state` and rejected reviewed `POST /api/run`; real Feishu Level 2 remains out of scope |
