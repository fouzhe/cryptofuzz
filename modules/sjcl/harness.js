"use strict";
"use math";

FuzzerInput = JSON.parse(FuzzerInput);

var toParts = function(modifier, input) {
    var ret = [];
    var modifierPos = 0;
    var pos = 0;

    while ( input.length - pos > 0 ) {
        var curLength = input.length - pos;

        if ( modifierPos + 3 <= modifier.length ) {
            var chunk = modifier.slice(modifierPos, modifierPos+3);
            var length = 0;
            length += chunk.charCodeAt(0) << 16;
            length += chunk.charCodeAt(1) << 8;
            length += chunk.charCodeAt(2);

            curLength = length % (curLength+1);
            modifierPos += 3;
        }

        var slice = input.slice(pos, pos+curLength);
        console.log(slice);
        ret.push(slice);
        pos += curLength;
    }

    return ret;
}

var processMultipart = function(obj, input, modifier) {
    /* input = toParts(modifier, input); */

    obj.update(input);

    return sjcl.codec.hex.fromBits(obj.finalize());
}

var digest = function(hasher, input, modifier) {
    return processMultipart(hasher, input, modifier);
}

var toHasher = function(digestType) {
    if ( IsSHA1(digestType) ) {
        return sjcl.hash.sha1;
    } else if ( IsSHA256(digestType) ) {
        return sjcl.hash.sha256;
    } else if ( IsSHA512(digestType) ) {
        return sjcl.hash.sha512;
    } else if ( IsRIPEMD160(digestType) ) {
        return sjcl.hash.ripemd160;
    }

    throw "Invalid digest type";
}

var toHasherInstance = function(digestType) {
    if ( IsSHA1(digestType) ) {
        return new sjcl.hash.sha1();
    } else if ( IsSHA256(digestType) ) {
        return new sjcl.hash.sha256();
    } else if ( IsSHA512(digestType) ) {
        return new sjcl.hash.sha512();
    } else if ( IsRIPEMD160(digestType) ) {
        return new sjcl.hash.ripemd160();
    }

    throw "Invalid digest type";
}

var toCurve = function(curveType) {
    if ( Isx962_p192v1(curveType) ) {
        return sjcl.ecc.curves.c192;
    } else if ( Issecp224r1(curveType) ) {
        return sjcl.ecc.curves.c224;
    } else if ( Isx962_p256v1(curveType) ) {
        return sjcl.ecc.curves.c256;
    } else if ( Issecp384r1(curveType) ) {
        return sjcl.ecc.curves.c384;
    } else if ( Issecp192k1(curveType) ) {
        return sjcl.ecc.curves.k192;
    } else if ( Issecp224k1(curveType) ) {
        return sjcl.ecc.curves.k224;
    } else if ( Issecp256k1(curveType) ) {
        return sjcl.ecc.curves.k256;
    }

    throw "Invalid curve type";
}

var OpDigest = function(FuzzerInput) {
    var digestType = parseInt(FuzzerInput['digestType']);
    var cleartext = sjcl.codec.hex.toBits(FuzzerInput['cleartext']);
    var modifier = sjcl.codec.hex.toBits(FuzzerInput['modifier']);

    var digestFn;
    try {
        digestFn = toHasherInstance(digestType);
    } catch ( e ) { return; }

    var ret = digest(digestFn, cleartext, modifier);
    FuzzerOutput = JSON.stringify(ret);
}

var OpHMAC = function(FuzzerInput) {
    var digestType = parseInt(FuzzerInput['digestType']);
    var cleartext = sjcl.codec.hex.toBits(FuzzerInput['cleartext']);
    var key = sjcl.codec.hex.toBits(FuzzerInput['cipher']['key']);
    var modifier = sjcl.codec.hex.toBits(FuzzerInput['modifier']);

    var digestFn;
    try {
        digestFn = toHasher(digestType)
    } catch ( e ) { return; }

    var hmac = new sjcl.misc.hmac(key, digestFn);
    var ret = sjcl.codec.hex.fromBits(hmac.encrypt(cleartext));

    FuzzerOutput = JSON.stringify(ret);
}

var OpSymmetricEncrypt = function(FuzzerInput) {
    var cleartext = sjcl.codec.hex.toBits(FuzzerInput['cleartext']);
    var cleartextSize = sjcl.bitArray.bitLength(cleartext) / 8;
    var cipherType = parseInt(FuzzerInput['cipher']['cipherType']);
    var key = sjcl.codec.hex.toBits(FuzzerInput['cipher']['key']);
    var keySize = sjcl.bitArray.bitLength(key) / 8;
    var iv = sjcl.codec.hex.toBits(FuzzerInput['cipher']['iv']);
    var ivSize = sjcl.bitArray.bitLength(iv) / 8;
    var aad = sjcl.codec.hex.toBits(FuzzerInput['aad']);
    var tagSize = parseInt(FuzzerInput['tagSize']);

    if ( aad.length || tagSize ) {
        return;
    }

    var ciphertextHex;

    if (
        (IsAES_128_CCM(cipherType) && keySize == 8) ||
        (IsAES_256_CCM(cipherType) && keySize == 16)
    ) {
        var cipher = new sjcl.cipher.aes(key);
        ciphertextHex = sjcl.codec.hex.fromBits(sjcl.mode.ccm.encrypt(cipher, cleartext, iv));
    } else if (
        (IsAES_128_GCM(cipherType) && keySize == 16 ) ||
        (IsAES_256_GCM(cipherType) && keySize == 32 )
    ) {
        var cipher = new sjcl.cipher.aes(key);
        ciphertextHex = sjcl.codec.hex.fromBits(sjcl.mode.gcm.encrypt(cipher, cleartext, iv, aad, tagSize));
    } else if (
        (IsAES_128_OCB(cipherType) && keySize == 16 && ivSize == 16 ) ||
        (IsAES_256_OCB(cipherType) && keySize == 32 && ivSize == 32 )
    ) {
        var cipher = new sjcl.cipher.aes(key);
        ciphertextHex = sjcl.codec.hex.fromBits(sjcl.mode.ocb2.encrypt(cipher, cleartext, iv, aad, tagSize));
    } else if (
        (IsAES_128_CTR(cipherType) && keySize == 16 && ivSize == 16 ) ||
        (IsAES_256_CTR(cipherType) && keySize == 32 && ivSize == 32 )
    ) {
        sjcl.beware["CTR mode is dangerous because it doesn't protect message integrity."]();

        var cipher = new sjcl.cipher.aes(key);
        ciphertextHex = sjcl.codec.hex.fromBits(sjcl.mode.ctr.encrypt(cipher, cleartext, iv));
    } else if (
        (IsAES_128_CBC(cipherType) && keySize == 16 && ivSize == 16 ) ||
        (IsAES_256_CBC(cipherType) && keySize == 32 && ivSize == 32 )
    ) {
        /* TODO padding */
        if ( 0 ) {
            sjcl.beware["CBC mode is dangerous because it doesn't protect message integrity."]();

            var cipher = new sjcl.cipher.aes(key);
            ciphertextHex = sjcl.codec.hex.fromBits(sjcl.mode.cbc.encrypt(cipher, cleartext, iv));
        } else {
            return;
        }
    } else {
        return;
    }

    ciphertextHex = ciphertextHex.substr(0, cleartextSize * 2);
    FuzzerOutput = JSON.stringify(ciphertextHex);
}

var OpSymmetricDecrypt = function(FuzzerInput) {
    var ciphertext = sjcl.codec.hex.toBits(FuzzerInput['ciphertext']);
    var ciphertextSize = sjcl.bitArray.bitLength(ciphertext) / 8;

    var cipherType = parseInt(FuzzerInput['cipher']['cipherType']);

    var key = sjcl.codec.hex.toBits(FuzzerInput['cipher']['key']);
    var keySize = sjcl.bitArray.bitLength(key) / 8;

    var iv = sjcl.codec.hex.toBits(FuzzerInput['cipher']['iv']);
    var ivSize = sjcl.bitArray.bitLength(iv) / 8;

    var aad = sjcl.codec.hex.toBits(FuzzerInput['aad']);
    var tag = sjcl.codec.hex.toBits(FuzzerInput['tag']);

    if ( aad.length || tag.length ) {
        return;
    }

    var cleartextHex;

    try {
        if (
            (IsAES_128_CCM(cipherType) && keySize == 8) ||
            (IsAES_256_CCM(cipherType) && keySize == 16)
        ) {
            var cipher = new sjcl.cipher.aes(key);
            cleartextHex = sjcl.codec.hex.fromBits(sjcl.mode.ccm.decrypt(cipher, ciphertext, iv, aad, 0));
        } else if (
            (IsAES_128_GCM(cipherType) && keySize == 16 ) ||
            (IsAES_256_GCM(cipherType) && keySize == 32 )
        ) {
            var cipher = new sjcl.cipher.aes(key);
            cleartextHex = sjcl.codec.hex.fromBits(sjcl.mode.gcm.decrypt(cipher, ciphertext, iv, aad, 0));
        } else if (
            (IsAES_128_OCB(cipherType) && keySize == 16 && ivSize == 16 ) ||
            (IsAES_256_OCB(cipherType) && keySize == 32 && ivSize == 32 )
        ) {
            var cipher = new sjcl.cipher.aes(key);
            cleartextHex = sjcl.codec.hex.fromBits(sjcl.mode.ocb2.decrypt(cipher, ciphertext, iv, aad, 0));
        } else if (
            (IsAES_128_CTR(cipherType) && keySize == 16 && ivSize == 16 ) ||
            (IsAES_256_CTR(cipherType) && keySize == 32 && ivSize == 32 )
        ) {
            sjcl.beware["CTR mode is dangerous because it doesn't protect message integrity."]();

            var cipher = new sjcl.cipher.aes(key);
            ciphertextHex = sjcl.codec.hex.fromBits(sjcl.mode.ctr.decrypt(cipher, cleartext, iv));
        } else if (
            (IsAES_128_CBC(cipherType) && keySize == 16 && ivSize == 16 ) ||
            (IsAES_256_CBC(cipherType) && keySize == 32 && ivSize == 32 )
        ) {
            /* TODO padding */
            if ( 0 ) {
                sjcl.beware["CBC mode is dangerous because it doesn't protect message integrity."]();

                var cipher = new sjcl.cipher.aes(key);
                ciphertextHex = sjcl.codec.hex.fromBits(sjcl.mode.ctr.decrypt(cipher, cleartext, iv));
            } else {
                return;
            }
        } else {
            return;
        }
    } catch ( e ) { return; }

    cleartextHex = cleartextHex.substr(0, cleartextSize * 2);
    FuzzerOutput = JSON.stringify(cleartextHex);

}

var OpKDF_HKDF = function(FuzzerInput) {
    var digestType = parseInt(FuzzerInput['digestType']);
    var password = sjcl.codec.hex.toBits(FuzzerInput['password']);
    var salt = sjcl.codec.hex.toBits(FuzzerInput['salt']);
    var info = sjcl.codec.hex.toBits(FuzzerInput['info']);
    var keySize = parseInt(FuzzerInput['keySize']);
    var modifier = sjcl.codec.hex.toBits(FuzzerInput['modifier']);

    var digestFn;
    try {
        digestFn = toHasher(digestType)
    } catch ( e ) { return; }

    var key = sjcl.misc.hkdf(password, keySize, salt, info, digestFn);

    key = sjcl.codec.hex.fromBits(key);
    if ( key.length % 2 == 0 ) {
        FuzzerOutput = JSON.stringify(sjcl.codec.hex.fromBits(key));
        console.log(FuzzerOutput);
    }
}


var OpKDF_PBKDF2 = function(FuzzerInput) {
    var digestType = parseInt(FuzzerInput['digestType']);
    var iterations = parseInt(FuzzerInput['iterations']);
    var keySize = parseInt(FuzzerInput['keySize']);
    var password = sjcl.codec.hex.toBits(FuzzerInput['password']);
    var salt = sjcl.codec.hex.toBits(FuzzerInput['salt']);
    var modifier = sjcl.codec.hex.toBits(FuzzerInput['modifier']);

    if ( iterations == 0 ) return;

    var digestFn;
    try {
        digestFn = toHasher(digestType);
    } catch ( e ) { }

    var hmac = function (key) {
        var hasher = new sjcl.misc.hmac(key, digestFn);
        this.encrypt = function () {
            return hasher.encrypt.apply(hasher, arguments);
        };
    };

    var derivedKey = sjcl.misc.pbkdf2(password, salt, iterations, keySize * 8, hmac);

    FuzzerOutput = JSON.stringify(sjcl.codec.hex.fromBits(derivedKey));
}

var OpKDF_SCRYPT = function(FuzzerInput) {
    var password = sjcl.codec.hex.toBits(FuzzerInput['password']);
    var salt = sjcl.codec.hex.toBits(FuzzerInput['salt']);
    var N = parseInt(FuzzerInput['N']);
    var r = parseInt(FuzzerInput['r']);
    var p = parseInt(FuzzerInput['p']);
    var keySize = parseInt(FuzzerInput['keySize']);
    var modifier = sjcl.codec.hex.toBits(FuzzerInput['modifier']);

    if ( N == 0 || r == 0 || p == 0 ) {
        return;
    }

    var derivedKey = sjcl.misc.scrypt(password, salt, N, r, p, keySize * 8);

    FuzzerOutput = JSON.stringify(sjcl.codec.hex.fromBits(derivedKey));
}

var OpBignumCalc = function(FuzzerInput) {
    var bn = [
        new sjcl.bn(FuzzerInput["bn0"]),
        new sjcl.bn(FuzzerInput["bn1"]),
        new sjcl.bn(FuzzerInput["bn2"]),
        new sjcl.bn(FuzzerInput["bn3"])
    ];
    var calcOp = parseInt(FuzzerInput["calcOp"]);

    if ( IsAdd(calcOp) ) {
        FuzzerOutput = JSON.stringify(bn[0].add(bn[1]).toString());
    } else if ( IsSub(calcOp) ) {
        FuzzerOutput = JSON.stringify(bn[0].sub(bn[1]).toString());
    } else if ( IsMul(calcOp) ) {
        FuzzerOutput = JSON.stringify(bn[0].mul(bn[1]).toString());
    } else if ( IsSqr(calcOp) ) {
        FuzzerOutput = JSON.stringify(bn[0].square().toString());
    } else if ( IsInvMod(calcOp) ) {
        try {
            FuzzerOutput = JSON.stringify(bn[0].inverseMod(bn[1]).toString());
        } catch ( e ) { }
    } else if ( IsSetBit(calcOp) ) {
    } else if ( IsExpMod(calcOp) ) {
        if (!bn[2].equals(0)) {
            //FuzzerOutput = JSON.stringify(bn[0].powermod(bn[1], bn[2]).toString());
        }
    } else if ( IsMulMod(calcOp) ) {
        if (!bn[2].equals(0)) {
            FuzzerOutput = JSON.stringify(bn[0].mulmod(bn[1], bn[2]).toString());
        }

    } else if ( IsMod(calcOp) ) {
        if (!bn[1].equals(0)) {
            FuzzerOutput = JSON.stringify(bn[0].mod(bn[1]).toString());
        }
    }
}

var OpECC_PrivateToPublic = function(FuzzerInput) {
    var curveType = parseInt(FuzzerInput['curveType']);

    var curve;
    try {
        curve = toCurve(curveType);
    } catch ( e ) { return; }

    var privBn = new sjcl.bn(FuzzerInput["priv"]);

    var pubBn = curve.G.mult(privBn);

    var pub = new sjcl.ecc['ecdsa'].publicKey(curve, pubBn);

    var pubPoint = pub.get();

    FuzzerOutput = JSON.stringify([sjcl.codec.hex.fromBits(pubPoint.x), sjcl.codec.hex.fromBits(pubPoint.y)]);
}

var operation = parseInt(FuzzerInput['operation']);

if ( IsDigest(operation) ) {
    OpDigest(FuzzerInput);
} else if ( IsHMAC(operation) ) {
    OpHMAC(FuzzerInput);
} else if ( IsSymmetricEncrypt(operation) ) {
    OpSymmetricEncrypt(FuzzerInput);
} else if ( IsSymmetricDecrypt(operation) ) {
    OpSymmetricDecrypt(FuzzerInput);
} else if ( IsKDF_HKDF(operation) ) {
    //OpKDF_HKDF(FuzzerInput);
} else if ( IsKDF_PBKDF2(operation) ) {
    OpKDF_PBKDF2(FuzzerInput);
} else if ( IsKDF_SCRYPT(operation) ) {
    OpKDF_SCRYPT(FuzzerInput);
} else if ( IsBignumCalc(operation) ) {
    OpBignumCalc(FuzzerInput);
} else if ( IsECC_PrivateToPublic(operation) ) {
    OpECC_PrivateToPublic(FuzzerInput);
}
