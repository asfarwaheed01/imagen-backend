import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
}
export interface SignInInput {
  email: string;
  password: string;
}

const SALT_ROUNDS = 12;
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

export type SafeUser = Omit<
  typeof users.$inferSelect,
  "passwordHash" | "resetPasswordToken" | "resetPasswordTokenExpiresAt"
>;

const sanitizeUser = (user: typeof users.$inferSelect): SafeUser => {
  const {
    passwordHash,
    resetPasswordToken,
    resetPasswordTokenExpiresAt,
    ...safe
  } = user;
  return safe;
};

export const generateTokens = (user: SafeUser) => {
  const payload = { sub: user.id, email: user.email };
  const accessToken = jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRY,
  });
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRY,
  });
  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;
export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, REFRESH_SECRET) as jwt.JwtPayload;

export const authService = {
  async signUp({ fullName, email, password }: SignUpInput) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (existing.length > 0)
      throw Object.assign(new Error("Email already in use"), { status: 409 });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const [user] = await db
      .insert(users)
      .values({ fullName, email: email.toLowerCase(), passwordHash })
      .returning();
    return sanitizeUser(user);
  },

  async findById(id: number): Promise<SafeUser | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) return null;
    return sanitizeUser(user);
  },

  async validateCredentials({ email, password }: SignInInput) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (!user)
      throw Object.assign(new Error("Invalid email or password"), {
        status: 401,
      });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      throw Object.assign(new Error("Invalid email or password"), {
        status: 401,
      });
    return sanitizeUser(user);
  },

  async forgotPassword(email: string) {
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (!user) return null;

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
    await db
      .update(users)
      .set({
        resetPasswordToken: token,
        resetPasswordTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    return { email: user.email, token };
  },

  async resetPassword(token: string, newPassword: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.resetPasswordToken, token))
      .limit(1);
    if (
      !user ||
      !user.resetPasswordTokenExpiresAt ||
      user.resetPasswordTokenExpiresAt < new Date()
    )
      throw Object.assign(new Error("Invalid or expired reset token"), {
        status: 400,
      });

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db
      .update(users)
      .set({
        passwordHash,
        resetPasswordToken: null,
        resetPasswordTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  },
};
