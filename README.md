# ProVR Design Platform

## 快速开始
```
# 创建虚拟环境
pip install -e .

# 运行服务
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000 --ssl-keyfile server.key --ssl-certfile server.crt
```
