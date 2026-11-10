# Ilustrador ACS — Sacrificio y Admin Charge

Página estática que muestra, para una prima y un término dados, cómo se mueven
juntos el **sacrificio de comisión**, la **comisión upfront del asesor** y el
**admin charge anual**. Se edita cualquiera de los tres y los otros dos se
recalculan. El front está en inglés; el código y esta documentación, en español.

Publicada con GitHub Pages desde la raíz de `main`:
<https://franciscojose7.github.io/ilustrador-acs-v3/>

## Estructura

```
index.html            markup de la página
assets/styles.css     estilos (claro/oscuro)
assets/app.js         lógica: interpolación, cálculo y gráfico
assets/gate.js        pantalla de acceso: descifra la tabla
assets/data.enc.js    la tabla, cifrada  ← esto es lo que se commitea
data.src.json         la tabla en claro  ← NO se commitea (.gitignore)
tools/crypt.js        cifra y descifra
```

Sin build ni dependencias más allá de Node para cifrar. **Se tiene que servir
por HTTP**, no con doble clic: `crypto.subtle` no existe en `file://`. En local:

```bash
npx serve .          # y abrir http://localhost:3000
```

## La contraseña

No está guardada en ninguna parte, ni siquiera hasheada: **es la clave con la
que se descifra la tabla**. Se deriva con PBKDF2-SHA256 (310.000 iteraciones) y
descifra `assets/data.enc.js` (AES-256-GCM). Si la clave es incorrecta el
descifrado falla y no hay nada que mostrar — el repo y la página publicada solo
tienen bytes cifrados.

Cambiar la clave = volver a cifrar con otra:

```
node tools/crypt.js encrypt "la clave nueva"
git commit -am "rotar clave"
git push
```

Como la única copia versionada es la cifrada, la clave es lo único que no se
puede perder: sin ella no hay forma de recuperar los números.

> El repo es público, así que el archivo cifrado se puede descargar y atacar
> offline. Los 310.000 rounds de PBKDF2 hacen que cada intento cueste, pero una
> clave corta igual cae. Conviene una frase larga.

## Cambiar los números

Los números en claro viven en `data.src.json`, que está en `.gitignore`. Si no
lo tenés en la máquina (clon nuevo, otra compu), se reconstruye desde la copia
cifrada:

```
node tools/crypt.js decrypt "la clave"     # -> data.src.json
                                           # editar data.src.json
node tools/crypt.js encrypt "la clave"     # -> assets/data.enc.js
git commit -am "actualizar tabla"
git push
```

La clave también se puede pasar por la variable `ACS_PASS` en vez de como
argumento (`$env:ACS_PASS = "la clave"` en PowerShell, `ACS_PASS="la clave"` en
bash). Sirve para no dejarla en el historial del shell, o si algún día esto
corre desde un workflow de GitHub Actions, donde sale de un secret.

| Clave del JSON | Qué es |
|---|---|
| `AC0` / `AC100` | admin charge anual por término, con 0% y 100% de sacrificio (solo si falta `ADMIN`) |
| `ADMIN` | anclas del admin charge total por término: `{terms:[3,4,5,8,10], max, min}` en %; se interpola lineal por días y se divide por días/365 (regla del sistema) |
| `MATRIX` | matriz publicada de admin charge (sacrificio × término) |
| `LEVELS` | escala de comisión de la estructura |
| `DEFAULT_LEVEL` | nivel que viene seleccionado al abrir |
| `PRIMA_MIN` / `PRIMA_MAX` | rango de prima admitido |

### Escala de comisión

Cada nivel trae su `pct` (el % que le corresponde en la estructura) y su `acs`:
la comisión upfront máxima —sin sacrificio— como % de la prima, a **3, 5, 8 y
10 años**. Entre esos términos se interpola con una curva monótona (pchip), así
que en 3, 5, 8 y 10 los valores dan exactos y en el medio no hay saltos ni
sobrepasos.

```json
{"n": 15, "pct": 85, "acs": [5.00, 7.00, 7.50, 7.90]}
```

El cálculo es:

```
Comisión upfront = ACS(nivel, término) × Prima × (1 − Sacrificio%)
Admin charge     = interpolación entre AC0 y AC100 según el sacrificio
```
