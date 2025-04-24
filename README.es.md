# MCP YNAB Server 💰

¡Bienvenido al servidor MCP para YNAB (versión TypeScript)! 🎉 Este proyecto te permite conectar Cursor (u otro cliente MCP) a tu cuenta de You Need A Budget (YNAB) para interactuar con tus datos financieros directamente desde tu editor.

## 1. ¿Qué es esto? 🤔 (Propósito)

Es una implementación del [Model Context Protocol (MCP)](https://docs.cursor.com/context/model-context-protocol) en TypeScript que actúa como un puente hacia la API oficial de YNAB. El objetivo es proporcionar herramientas estandarizadas para leer y escribir datos de YNAB desde entornos compatibles con MCP, permitiendo a asistentes de IA como el de Cursor ayudarte con tus finanzas.

## 2. Herramientas Disponibles 🛠️

Este servidor proporciona las siguientes herramientas, cada una con su documentación detallada (próximamente en español):

*   [`listBudgets`](src/tools/listBudgets/README.es.md): Lista tus presupuestos disponibles.
*   [`listAccounts`](src/tools/listAccounts/README.es.md): Lista las cuentas dentro de un presupuesto especificado.
*   [`getAccountBalance`](src/tools/getAccountBalance/README.es.md): Obtiene el saldo actual para una cuenta específica.
*   [`listCategories`](src/tools/listCategories/README.es.md): Lista las categorías dentro de un presupuesto especificado.
*   [`getCategoryInfo`](src/tools/getCategoryInfo/README.es.md): Obtiene información detallada sobre una categoría específica para un mes determinado.
*   [`getBudgetSummary`](src/tools/getBudgetSummary/README.es.md): Proporciona un resumen del presupuesto (ingresos, presupuestado, actividad) para un mes específico.
*   [`listTransactions`](src/tools/listTransactions/README.es.md): Lista las transacciones de un presupuesto, con opciones de filtrado (por cuenta, categoría, fecha, etc.).
*   [`createTransaction`](src/tools/createTransaction/README.es.md): Crea una nueva transacción o transacción dividida dentro de un presupuesto.

Consulta el archivo `README.es.md` de cada herramienta para obtener información detallada sobre argumentos, salida y contexto de uso.

## 3. Configuración 🚀

1.  **Clona el Repositorio:**
    ```bash
    # git clone <URL_DEL_REPOSITORIO> # Si aún no lo has hecho
    cd mcp-ynab 
    ```
2.  **Instala Dependencias:**
    ```bash
    npm install
    ```
3.  **Configura tu Token de API de YNAB:** Necesitas un [Token de Acceso Personal](https://app.ynab.com/settings/developer) de YNAB. La forma **recomendada y probada** para la integración con Cursor es:
    *   Edita tu archivo de configuración global de Cursor `~/.cursor/mcp.json`.
    *   Añade o modifica la entrada para `mcp-ynab` asegurándote de que el `command`, `args`, `cwd` y `env` son correctos:
        ```json
        {
          "mcpServers": {
            // ... otros servidores ...
            "mcp-ynab": {
              "command": "node",
              // 👇 Ruta al script compilado
              "args": ["<ruta-a-tu-proyecto>/mcp-ynab/dist/server.js"], 
              "cwd": "<ruta-a-tu-proyecto>/mcp-ynab", // Ruta a este proyecto
              "enabled": true,
              "env": {
                // 👇 ¡Tu token YNAB aquí, con el nombre correcto!
                "YNAB_API_TOKEN": "TU_TOKEN_DE_YNAB_AQUI" 
              }
            }
            // ... otros servidores ...
          }
        }
        ```
    *   *Alternativa (requiere modificar código):* Podrías usar un archivo `.env` en la raíz del proyecto, pero necesitarías descomentar la lógica de `dotenv` en `src/server.ts` y asegurar que no interfiera con el modo servidor.

4.  **Compila el Código:**
    ```bash
    npm run build
    ```

## 4. Uso con Cursor 💡

1.  Asegúrate de que la configuración en `~/.cursor/mcp.json` es correcta y `"enabled": true`.
2.  **Reinicia Cursor** para que cargue la configuración actualizada y lance el servidor.
3.  ¡Listo! En los ajustes de MCP de Cursor, deberías ver `mcp-ynab` con un punto verde y la lista de herramientas disponibles.
4.  Ahora puedes pedirle al asistente de IA que use las herramientas:
    *   "Lista mis presupuestos de YNAB"
    *   "Usa `mcp_ynab_list_accounts` con el budget_id 'last-used'"
    *   "Cuál es el saldo de mi cuenta X (ID: YYY) en el presupuesto Z?" (Podría usar `mcp_ynab_get_account_balance`)

## 5. Desarrollo 🧑‍💻

*   **Ejecutar servidor en modo desarrollo (con recarga):** `npm run dev`
*   **Ejecutar pruebas:** `npm test`
*   **Compilar para producción/MCP:** `npm run build`
*   **Modo CLI (Comentado):** La lógica para ejecutar comandos como `node dist/server.js list-budgets` está comentada en `src/server.ts` porque interfería con el modo servidor MCP de Cursor. Puedes descomentarla para pruebas locales si es necesario, pero recuerda comentarla de nuevo y recompilar para la integración con Cursor.

---

[![Star History Chart](https://api.star-history.com/svg?repos=bulletninja/mcp-ynab&type=Date)](https://star-history.com/#bulletninja/mcp-ynab&Date) 
