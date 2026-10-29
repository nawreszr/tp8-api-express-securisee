const express = require('express');
const { contactSchema } = require('../schemas/contact');
const validate = require('../middlewares/validate');

module.exports = (contactRepository) => {
  // Le routeur est maintenant déclaré ICI, pour chaque instance
  const router = express.Router();
  
  router.post('/', validate(contactSchema), async (req, res, next) => {
    try {
      const newContact = await contactRepository.create(req.body);
      res.status(201).json({ success: true, data: newContact });
    } catch (err) {
      next(err);
    }
  });
  
  return router;
};
