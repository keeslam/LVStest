for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:5001/api/vehicles?limit=1)
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $code"
  if [ "$code" != "000" ]; then
    echo "SERVER_UP"
    break
  fi
  sleep 15
done
