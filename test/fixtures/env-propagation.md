# Env Propagation Test

## Testing

### Setup environment
```bash
export BASE_URL="http://example.com"
export API_TOKEN="test123"
```

### Test 1: Verify env vars are available
```bash
echo "BASE_URL=$BASE_URL"
echo "API_TOKEN=$API_TOKEN"
```
check: Output shows BASE_URL=http://example.com
check: Output shows API_TOKEN=test123

### Test 2: Verify working directory persists
```bash
cd /tmp
pwd
```
check: Output shows /tmp

### Test 3: Verify working directory carried over
```bash
pwd
```
check: Output shows /tmp (carried from previous block)
