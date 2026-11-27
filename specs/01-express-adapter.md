## Converting the apps/api into a express adapter.

Our goal is to convert the apps/api into a express adapter that will be a covering layer that will be used by the person downloading the package of ours. The express adapter will be a controller and api adapter that will cover all the api and auth routes and then use the @cred-kit/core which contains all the fuctions that are needed in the auth and other operations. But the @cred-kit/core needs two things. It needs deps which are the adapters @cred-kit/smtp and @cred-kit/mongo-storage. These are the dependencies that are needed to be passed to the @cred-kit/core to be able to use it's function. I will convince you to read the @cred-kit/core completely and @cred-kit/smtp along with mongo-storage so you will have the complete idea. You will have to build the both adapters then pass them to the functions that will imported from the @cred-kit/core. The user will just import the credExpress factory and pass him the needed params and then say like app.use('/',credExpress({ and the needed params. })). SO this is how i want the flow to be exactly. The express adapter will be just a controller router and routes that will just use the @cred-kit/core functions to do everything so they dont have to like manually interact with the database and models and functions or helper, @cred-kit/core has everything they need and all it has to do is do dependency injection in the functions and it will have things. But the main thing that @cred-kit/express-adapter neeeds to do is handle responsing and error handling and redirecting and all the other factors like rate-limiting and express related things because the @cred-kit/core is just a function pacakge and it can't redirect user to a specific page after login or after password reset or oauth callback so the main job is this. 

# Example Info on the implementation:

The user doesn’t define routes at all. The route table lives inside @cred-kit/express, and the user mounts the whole router at one path:

ts
- "app.use('/api', credExpress({ ...config }));

/auth/login, /auth/refresh, /profile/me and the rest are already defined in the package. Each route is wired to its controller, and each controller calls the right core function. There’s no discovery or matching by name. It’s an explicit table you write once.

How it’s structured
packages/express/src/
  index.ts              credExpress(config): builds and returns the Router
  config.ts             defaults + validation
  router.ts             the route table
  controllers/          factories that close over deps
  middleware/           requireAuth, validate, rate limiters, errorHandler

Controllers are factories. This is how a controller “knows” which database and email to use. It receives them when the router is built:

ts
// controllers/auth.controller.ts
import { login as loginUser, AuthError } from '@cred-kit/core';

export function createAuthController(config: ResolvedConfig, deps: CoreDeps) {
  return {
    login: async (req: Request, res: Response) => {
      const { user, accessToken, refreshToken } = await loginUser(
        req.body, deps, { jwtSecret: config.jwtSecret }, { ip: req.ip },
      );
      setAuthCookies(res, accessToken, refreshToken, config);
      return sendSuccess(res, { user }, 'Logged in successfully', 200);
    },
    // register, logout, refresh, verifyEmail, forgotPassword, resetPassword...
  };
}

The route table maps URL to handler. It is your current routes files moved into one place:

ts
// router.ts
export function createRouter(config: ResolvedConfig, deps: CoreDeps) {
  const auth = createAuthController(config, deps);
  const profile = createProfileController(config, deps);
  const limit = createRateLimiters(config.rateLimits);

  const authRouter = Router();
  authRouter.use(limit.auth);
  authRouter.post('/',                      limit.register, validate(registerSchema), auth.register);
  authRouter.post('/login',                 limit.login,    validate(loginSchema),    auth.login);
  authRouter.post('/refresh',               limit.refresh,  auth.refresh);
  authRouter.get('/verify-email/:token',    limit.verifyEmail, auth.verifyEmail);
  // ...

  const profileRouter = Router();
  profileRouter.use(limit.profile, requireAuth(config));
  profileRouter.get('/me', profile.getProfile);
  // ...

  const router = Router();
  router.use(express.json({ limit: '10kb' }));
  router.use(cookieParser());
  router.use('/auth', authRouter);
  router.use('/profile', profileRouter);
  router.use(errorHandler);
  return router;
}

Put express.json and cookieParser inside the router, scoped to cred-kit’s routes, so users don’t have to remember them and cred-kit doesn’t change parsing for the rest of their app.

The entry point resolves config and wires everything:

ts
export function credExpress(userConfig: CredExpressConfig) {
  const config = resolveConfig(userConfig);   // merge defaults, throw clear errors
  const deps = {
    userDatabase: config.database.user,
    refreshTokenDatabase: config.database.refreshToken,
    auditDatabase: config.database.audit,
    email: config.email,
  };
  return createRouter(config, deps);
}
Where the mount path leaks in

Using app.use('/api', ...) reproduces your current URLs exactly (/api/auth/login), so your existing tests should pass. But a few things in your code depend on the full path, and the router can’t hardcode them anymore:

The refresh cookie path: '/api/auth'. If someone mounts at /v1, the cookie is scoped wrong and refresh breaks. Derive it from req.baseUrl + '/auth' inside the handler, or take a basePath option.
OAuth callback URLs ({BACKEND_URL}/api/auth/google/callback) and email links (verify and reset). These are built from the public URL, so config needs backendUrl and basePath (default /api). Tell users the mount path must match basePath.

Simplest for v0.1 is a basePath: '/api' option that you use for cookies, email links and OAuth callbacks. Document that it must match where they mount."

This is just a example code that i used to reference just how the code should work. 

# Scaffolding package

Create a express typescript app and add eslint along with tsdown and full commands in the package.json. Add linting build commands and eslint command. Make the folder structure as same as other packages (e.g: @cred-kit/core and @cred-kit/mongo-storage). Follow the same code structure as the other packages and it should be following the same code patterns. 

# Building the project 

Be professional while building the packages. Act as a senior developer and write production-ready code and be professional. Do not go off limit and do only what you are assigned which is to just create the package. You will not write any tests or any other things off scope. Do not write code that you dont understand and do not remove anything that you not understand. 

# Checkpoint.md
 
Write a file that contains all the project state and project list that will serve as a checkpoint so that you never go off-track. After each task completion tick it in the file.  



# notes

- be careful while updating things and do not break anything
- follow modern world practices and always stay in limits and dont go off track.
- write production-ready code
- Do not remove anything untill necessary.
- Be reminded that this will be a pacakage that user will import and use it in their routes. This app will not serve http server or anything but just provide the express router and controllers.
- You will have to make the controller to be thin like just they will use the core functions in the controller and just handle the redirects and other things that core could'nt due to it's functions-only state and limits.