:url = http://localhost:3000

#
GET :url/users

#
GET :url/horses

#
PUT :url/horses/{id}?action=buy

#
PUT :url/horses/{id}?action=sell

#
PUT :url/bet/{id}?action=bet

#
POST :url/register
Content-Type: application/json
{
    "username" : "pippo23",
    "password" : "password"
}
