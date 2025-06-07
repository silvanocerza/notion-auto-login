# Notion auto login

The project uses [`pnpm`](https://pnpm.io/) as package manager.

Install dependencies:

```
pnpm install
```

Build the project:

```
pnpm build
```

To properly run the project you must set the following env vars:

- `GOOGLE_MAIL`
- `GOOGLE_PASSWORD`

You have a choice for two factor authentication handling, you can either provide the TOTP secret with `GOOGLE_TOTP_SECRET` to generate the code whenever necessary, or set the actual totp code with `GOOGLE_TOTP`.

If both are set `GOOGLE_TOTP` takes precedence and `GOOGLE_TOTP_SECRET` is ignored.

You can store these in `.env`

To run project:

```
pnpm start
```

The extracted data is going to be saved in the `data` folder.
The screenshots are going to be in `data/screenshots`.
