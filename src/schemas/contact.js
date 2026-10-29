const { z } = require('zod');

const contactSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 chars").max(100, "Name too long"),
  email: z.string().trim().email("Invalid email").max(254, "Email too long"),
  message: z.string().trim().min(10, "Message must be at least 10 chars").max(2000, "Message too long")
}).strict(); // .strict() empêche l'ajout de champs non autorisés

module.exports = { contactSchema };
