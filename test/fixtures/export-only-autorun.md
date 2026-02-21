# Export-Only Auto-run Test

## Testing

### Setup
```bash
export MY_VAR="hello"
```

### Test: Var should be set
```bash
echo "MY_VAR=$MY_VAR"
```
check: Output shows MY_VAR=hello
check: Setup block ran without prompting
