import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { authService } from "../services/auth.service";

passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await authService.validateCredentials({ email, password });
        return done(null, user);
      } catch (err: any) {
        return done(null, false, { message: err.message });
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) return done(null, false);
    const { passwordHash, resetPasswordToken, resetPasswordTokenExpiresAt, ...safe } = user;
    done(null, safe);
  } catch (err) {
    done(err);
  }
});

export default passport;