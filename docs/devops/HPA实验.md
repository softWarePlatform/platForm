# HPA 配置与实验

## 配置

`k8s/monolith/hpa.yaml` 使用 `autoscaling/v2`，为无状态 API Gateway 配置 CPU 利用率目标 60%、最小 1 副本、最大 5 副本。Gateway Deployment 配置了 CPU `requests`，否则利用率型 HPA 无法计算。三个业务服务仍挂载 `ReadWriteOnce` 上传卷，不直接做跨节点水平扩容。

Metrics Server 使用仓库内固定的 v0.9.0 清单：

```powershell
./scripts/install-metrics-server.ps1
kubectl top nodes
kubectl top pods -n teaching-platform
```

仓库清单包含 `--kubelet-insecure-tls`，只用于 Docker Desktop 自签名 kubelet 证书。生产集群应使用受信任证书，并删除该参数或采用平台管理员提供的 Metrics Server。

## 执行负载实验

```powershell
./scripts/hpa-load-test.ps1 `
  -DurationSeconds 180 `
  -Parallelism 40 `
  -EvidenceDirectory test-results/hpa
```

脚本使用 BusyBox 兼容的 Unix 时间计算，并通过标准输入提交 Pod JSON，兼容 Windows PowerShell 5.1 和 PowerShell 7。它会先验证 Gateway 可访问，再检查负载 Pod 的实际运行时长、完成标记和退出码；Pod 刚启动时 Metrics Server 暂无指标只会记录为等待状态。负载 Pod 完成后，`kubectl top pod hpa-load` 不再有实时指标是正常现象；应查看 `test-results/hpa/load-generator.log` 和 `hpa-during-load.log`。

观察：

```powershell
kubectl -n teaching-platform get hpa api-gateway -w
kubectl -n teaching-platform get pods -l app.kubernetes.io/name=api-gateway -w
```

扩容停止后默认有 300 秒缩容稳定窗口。约五分钟后再次记录：

```powershell
kubectl -n teaching-platform get hpa,pods -o wide |
  Tee-Object test-results/hpa/scale-down.log
```

验收标准：`TARGETS` 不为 `<unknown>`；压力期间副本数高于 `minReplicas`；负载消失并超过稳定窗口后回落；所有新 Pod 通过 readiness。

若 `TARGETS` 为 `<unknown>`：

```powershell
kubectl get apiservice v1beta1.metrics.k8s.io
kubectl -n kube-system logs deployment/metrics-server --tail=200
kubectl describe hpa api-gateway -n teaching-platform
```
