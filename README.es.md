# MCP YNAB Server 💰

¡Bienvenido al servidor MCP para YNAB (versión TypeScript)! 🎉 Este proyecto te permite conectar Cursor (u otro cliente MCP) a tu cuenta de You Need A Budget (YNAB) para interactuar con tus datos financieros directamente desde tu editor.

## 1. ¿Qué es esto? 🤔 (Propósito)

Es una implementación del [Model Context Protocol (MCP)](https://docs.cursor.com/context/model-context-protocol) en TypeScript que actúa como un puente hacia la API oficial de YNAB. El objetivo es proporcionar herramientas estandarizadas para leer y escribir datos de YNAB desde entornos compatibles con MCP, permitiendo a asistentes de IA como el de Cursor ayudarte con tus finanzas.

## 2. Características Principales 🛠️

El servidor proporciona herramientas MCP para:

*   `mcp_ynab_list_budgets`: Lista tus presupuestos.
*   `mcp_ynab_list_accounts`: Lista las cuentas de un presupuesto.
*   `mcp_ynab_list_transactions`: Lista transacciones (con filtros opcionales).
*   `mcp_ynab_get_account_balance`: Obtiene el saldo de una cuenta.
*   `mcp_ynab_list_categories`: Lista las categorías de un presupuesto.
*   `mcp_ynab_get_budget_summary`: Obtiene el resumen del mes actual.
*   `mcp_ynab_get_category_info`: Obtiene detalles de una categoría específica.
*   `mcp_ynab_create_transaction`: Crea una nueva transacción (¡recuerda usar milliunits!).

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
              "args": ["/Users/luis/projects/mcp_servers/mcp-ynab/dist/server.js"], 
              "cwd": "/Users/luis/projects/mcp_servers/mcp-ynab", // Ruta a este proyecto
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

[![Star History Chart](https://api.star-history.com/svg?repos=luis/mcp-ynab&type=Date)](https://star-history.com/#luis/mcp-ynab&Date) 
*(Reemplaza `luis/mcp-ynab` con tu usuario/repo real si es diferente)*
